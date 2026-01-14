// this will stop the JS from executing if CSS is disabled or a CSS file fails to load; it will also remove any existing CSS from the DOM
require('check-if-css-is-disabled')()
window.addEventListener('cssDisabled', (event) => {
  // undo any DOM manipulations and then stop any further JS from executing
  document.body.classList.replace('js', 'no-js')
  throw new Error('A CSS file failed to load at some point during the app\'s usage. It is unsafe to execute any further JavaScript if the CSS has not loaded properly.')
})

// replace no-js class with js class which allows us to write css that targets non-js or js enabled users separately
document.body.classList.replace('no-js', 'js')

// semantic forms ui library js support https://github.com/kethinov/semanticforms
require('semantic-forms')()

// TODO: when a "show thinking" details is opened, it should remember its state across refreshes. It would be nice to update the chatHistory on the session, but we would need to find a way to do that from the client side

const icons = {
  send: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.3938 2.20468C3.70395 1.96828 4.12324 1.93374 4.4679 2.1162L21.4679 11.1162C21.7953 11.2895 22 11.6296 22 12C22 12.3704 21.7953 12.7105 21.4679 12.8838L4.4679 21.8838C4.12324 22.0662 3.70395 22.0317 3.3938 21.7953C3.08365 21.5589 2.93922 21.1637 3.02382 20.7831L4.97561 12L3.02382 3.21692C2.93922 2.83623 3.08365 2.44109 3.3938 2.20468ZM6.80218 13L5.44596 19.103L16.9739 13H6.80218ZM16.9739 11H6.80218L5.44596 4.89699L16.9739 11Z" fill="currentColor"/></svg>',
  stop: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4 8C4 5.79086 5.79086 4 8 4H16C18.2091 4 20 5.79086 20 8V16C20 18.2091 18.2091 20 16 20H8C5.79086 20 4 18.2091 4 16V8ZM8 6C6.89543 6 6 6.89543 6 8V16C6 17.1046 6.89543 18 8 18H16C17.1046 18 18 17.1046 18 16V8C18 6.89543 17.1046 6 16 6H8Z" fill="currentColor"/></svg>'
}

document.getElementById('prompt').focus()

// start web socket server for llm response streaming
const socketClient = new window.WebSocket(window.location.href.replace('https://', 'wss://').replace('ws://', 'ws://'))

// submit upon hitting enter
const textarea = document.getElementById('prompt')
if (textarea) {
  textarea.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      if (!event.shiftKey) { // shift+enter allows newlines
        event.preventDefault()
        sendPrompt(event)
      }
    }
  })
}

// intercept form submit to stream in a response from the llm
document.querySelector('form').addEventListener('submit', sendPrompt)

async function abortPrompt (event) {
  // disable the button so that multiple abort requests are not sent
  event.target.disabled = true

  // TODO: send an abort signal to ollama and stop any further responses
  console.log('abort...')

  document.getElementsByTagName('progress')[0]?.remove()
}

// send prompt to llm over the web socket
async function sendPrompt (event) {
  if (event.target.id === 'prompt' || event.submitter.id === 'send' || event?.submitter?.id !== 'clearChatHistory') {
    event?.preventDefault()

    const prompt = document.getElementById('prompt').value
    if (prompt === '') return

    document.getElementById('prompt').disabled = true

    const sendBtn = document.getElementById('send')
    sendBtn.title = 'Stop prompt'
    sendBtn.innerHTML = icons.stop
    sendBtn.addEventListener('click', abortPrompt)

    // create new chat entry
    document.getElementById('chatHistory').insertAdjacentHTML('beforeend', `<article class="prompt">${document.getElementById('prompt').value}</article>`)
    document.getElementById('chatHistory').insertAdjacentHTML('beforeend', '<article class="response"><progress></progress></article>')

    // create thinking entry
    if (document.querySelector('#showThinking').checked) {
      document.getElementById('chatHistory').insertAdjacentHTML('beforeend', '<details class="thinking" open><summary>Show thinking</summary><section></section></details>')
    }

    // send to web socket server
    messageSoFar = ''
    thinkingSoFar = ''
    const formData = Object.fromEntries(new FormData(document.querySelector('form')).entries())
    // TODO: convert `files` into a string-based data structure somehow
    formData.prompt = prompt

    // TODO: gather state of details elements here to be passed along to the chat history

    socketClient.send(JSON.stringify(formData))

    // clear the prompt
    document.getElementById('prompt').value = ''
  }
}

// handle streaming response from llm
const markdownToHTML = require('models/markdownToHTML')
let messageSoFar
let thinkingSoFar
socketClient.onmessage = (event) => {
  const response = JSON.parse(event.data)

  if (response.chunk && response.type === 'response') {
    document.getElementsByTagName('progress')[0]?.remove()
    messageSoFar += response.chunk
    document.querySelector('#chatHistory .response:last-of-type').innerHTML = markdownToHTML(messageSoFar)
  } else if (document.querySelector('#showThinking').checked && response.chunk && response.type === 'thinking') {
    thinkingSoFar += response.chunk
    document.querySelector('#chatHistory .thinking:last-of-type section').innerHTML = markdownToHTML(thinkingSoFar)
  } else if (response.done) {
    document.getElementById('prompt').disabled = false
    const sendBtn = document.getElementById('send')
    sendBtn.title = 'Send prompt'
    sendBtn.innerHTML = icons.send
    sendBtn.disabled = false
    sendBtn.removeEventListener('click', abortPrompt)
  }
}

// maintain scroll at bottom on new content
const chatHistory = document.getElementById('chatHistory')
chatHistory.scrollTop = chatHistory.scrollHeight
const callback = (mutationsList) => {
  for (const mutation of mutationsList) {
    if (mutation.type === 'childList') {
      chatHistory.scrollTop = chatHistory.scrollHeight
    }
  }
}
const observer = new window.MutationObserver(callback)
observer.observe(chatHistory, { childList: true })
