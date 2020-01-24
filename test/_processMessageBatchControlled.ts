import * as SQS from 'aws-sdk/clients/sqs'
const sqs = new SQS({ region: 'eu-central-1' })
import { Consumer } from '../src/index'

async function sendTestMessages () {
  const messages = [
    {
      MessageBody: { id: 1, success: true }
    },
    {
      MessageBody: { id: 2, success: true }
    },
    {
      MessageBody: { id: 3, success: false }
    },
    {
      MessageBody: { id: 4, success: true }
    },
    {
      MessageBody: { id: 5, success: false }
    }
  ]
  const work = messages.map(message => ({
    QueueUrl: process.env.QUEUE_URL,
    MessageBody: JSON.stringify(message.MessageBody)
  })).map(message => sqs.sendMessage(message).promise())
  try {
    await Promise.all(work)
    console.log(' sent ' + messages.length + ' messages ...')
    return true
  } catch (e) {
    console.log('could not send messages')
    console.log(e)
  }
}

function setupConsumer () {
  async function workOnMessage(message) {
    const body = JSON.parse(message.Body)
    console.log('working on message ' + body.id)
    if (body.success) {
      return message
    } else {
      throw new Error('This message can not succeed. -> ' + message.Body)
    }
  }
  
  async function handleMessageBatchControlled (messages) {
    const succeededMessages = []
    await Promise.all(
      messages.map(message => workOnMessage(message).then(
        successfullMessage => { succeededMessages.push(successfullMessage) },
        err => { console.log(err.message) } // !!! catch errors and handle them ...
      ))
    )
    return succeededMessages // !!! return succeededMessage to delete them from sqs...
  }  


  const consumer = new Consumer({
    queueUrl: process.env.QUEUE_URL,
    sqs,
    handleMessageBatchControlled,
    batchSize: 10,
    terminateVisibilityTimeout: true
  })
  
  consumer.start()
}

sendTestMessages().then(
  res => setupConsumer()
).catch(err => console.log(err.message))
