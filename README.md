# sqs-consumer

Build SQS-based applications without the boilerplate. Just define an async function that handles the SQS message processing. (Forked from bbc/sqs-consumer)

## Installation

```bash
npm install @parcellab/sqs-consumer --save
```

## Usage

```js
const { Consumer } = require('@parcellab/sqs-consumer');

const app = Consumer.create({
  queueUrl: 'https://sqs.eu-west-1.amazonaws.com/account-id/queue-name',
  handleMessage: async (message) => {
    // do some work with `message`
  }
});

app.on('error', (err) => {
  console.error(err.message);
});

app.on('processing_error', (err) => {
  console.error(err.message);
});

app.start();
```

* The queue is polled continuously for messages using [long polling](http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-long-polling.html).
* Messages are deleted from the queue once the handler function has completed successfully.
* Throwing an error (or returning a rejected promise) from the handler function will cause the message to be left on the queue. An [SQS redrive policy](http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/SQSDeadLetterQueue.html) can be used to move messages that cannot be processed to a dead letter queue.
* By default messages are processed one at a time – a new message won't be received until the first one has been processed. To process messages in parallel, use the `batchSize` option [detailed below](#options).

### Credentials

By default the consumer will look for AWS credentials in the places [specified by the AWS SDK](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html#Setting_AWS_Credentials). The simplest option is to export your credentials as environment variables:

```bash
export AWS_SECRET_ACCESS_KEY=...
export AWS_ACCESS_KEY_ID=...
```

If you need to specify your credentials manually, you can use a pre-configured instance of the [AWS SQS](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html) client:


```js
const { Consumer } = require('sqs-consumer');
const AWS = require('aws-sdk');

AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: '...',
  secretAccessKey: '...'
});

const app = Consumer.create({
  queueUrl: 'https://sqs.eu-west-1.amazonaws.com/account-id/queue-name',
  handleMessage: async (message) => {
    // ...
  },
  sqs: new AWS.SQS()
});

app.on('error', (err) => {
  console.error(err.message);
});

app.on('processing_error', (err) => {
  console.error(err.message);
});

app.on('timeout_error', (err) => {
 console.error(err.message);
});

app.start();
```

## Extra: handleMessageBatchControlled

Since `handleMessageBatch` won't delete any of the messages from the queue if the handler failed, you can use this if you want more control of the process.  
`handleMessageBatchControlled` works same as `handleMessageBatch` BUT you HAVE to return an Array of messages that should be deleted from the list. If no Array is returned, no messages will be removed!  
Whit `handleMessageBatchControlled` you can deal with a batch of messages and then handle the failed ones with the option to delete the succeeded messages.

### Implementation example

```javascript
const app = Consumer.create({
  queueUrl: 'https://sqs.eu-west-1.amazonaws.com/account-id/queue-name',
  sqs: new AWS.SQS(),
  batchSize: 10,
  handleMessageBatchControlled: async (messages) => {
    let succeededMessages = await Promise.all(messages.map(doSomeAsyncWork))
    .filter(msg => !!msg) // filter out all null/falsy
    return succeededMessages // return array of messages (to delete from SQS)
  },
});

// how you could handle the message batch:
// -> this function should not throw Errors and return a message if succeeded
// -> if this function will throw an Error, none of the messages will be deleted
async function doSomeAsyncWork (message) {
  try {
    // do some stuff ...
    return message // ... return the message if succeeded
  } catch (err) {
    console.log(err) // handle err ...
    return null // ... return e.g. null if failed
  }
}
```

## API

### `Consumer.create(options)`

Creates a new SQS consumer.

#### Options

* `queueUrl` - _String_ - The SQS queue URL
* `region` - _String_ - The AWS region (default `eu-west-1`)
* `handleMessage` - _Function_ - An `async` function (or function that returns a `Promise`) to be called whenever a message is received. Receives an SQS message object as it's first argument.
* `handleMessageBatch` - _Function_ - An `async` function (or function that returns a `Promise`) to be called whenever a batch of messages is received. Similar to `handleMessage` but will receive the list of messages, not each message individually. **If both are set, `handleMessageBatch` overrides `handleMessage`**.
* `handleMessageBatchControlled` - _Function_ - An `async` function (or function that returns a `Promise`) to be called whenever a batch of messages is received. Similar to `handleMessageBath` but the Promise HAS to return a list of messages that should be deleted from SQS. **If the Promise does not return a list of messages, `handleMessageBatch` won't delete anything from the queue!**.
* `handleMessageTimeout` - _String_ - Time in ms to wait for `handleMessage` to process a message before timing out. Emits `timeout_error` on timeout. By default, if `handleMessage` times out, the unprocessed message returns to the end of the queue.
* `attributeNames` - _Array_ - List of queue attributes to retrieve (i.e. `['All', 'ApproximateFirstReceiveTimestamp', 'ApproximateReceiveCount']`).
* `messageAttributeNames` - _Array_ - List of message attributes to retrieve (i.e. `['name', 'address']`).
* `batchSize` - _Number_ - The number of messages to request from SQS when polling (default `1`). This cannot be higher than the AWS limit of 10.
* `visibilityTimeout` - _Number_ - The duration (in seconds) that the received messages are hidden from subsequent retrieve requests after being retrieved by a ReceiveMessage request.
* `terminateVisibilityTimeout` - _Boolean_ - If true, sets the message visibility timeout to 0 after a `processing_error` (defaults to `false`).
* `waitTimeSeconds` - _Number_ - The duration (in seconds) for which the call will wait for a message to arrive in the queue before returning.
* `authenticationErrorTimeout` - _Number_ - The duration (in milliseconds) to wait before retrying after an authentication error (defaults to `10000`).
* `pollingWaitTimeMs` - _Number_ - The duration (in milliseconds) to wait before repolling the queue (defaults to `0`).
* `sqs` - _Object_ - An optional [AWS SQS](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html) object to use if you need to configure the client manually

### `consumer.start()`

Start polling the queue for messages.

### `consumer.stop()`

Stop polling the queue for messages.

### `consumer.isRunning`  

Returns the current polling state of the consumer: `true` if it is actively polling, `false` if it is not.

### Events

Each consumer is an [`EventEmitter`](http://nodejs.org/api/events.html) and emits the following events:

|Event|Params|Description|
|-----|------|-----------|
|`error`|`err`, `[message]`|Fired when an error occurs interacting with the queue. If the error correlates to a message, that error is included in Params|
|`processing_error`|`err`, `message`|Fired when an error occurs processing the message.|
|`timeout_error`|`err`, `message`|Fired when `handleMessageTimeout` is supplied as an option and if `handleMessage` times out.|
|`message_received`|`message`|Fired when a message is received.|
|`message_processed`|`message`|Fired when a message is successfully processed and removed from the queue.|
|`response_processed`|None|Fired after one batch of items (up to `batchSize`) has been successfully processed.|
|`stopped`|None|Fired when the consumer finally stops its work.|
|`empty`|None|Fired when the queue is empty (All messages have been consumed).|

### AWS IAM Permissions

Consumer will receive and delete messages from the SQS queue. Ensure `sqs:ReceiveMessage` and `sqs:DeleteMessage` access is granted on the queue being consumed.


### Contributing 
See contributing [guildlines](https://github.com/bbc/sqs-consumer/blob/master/CONTRIBUTING.md)
