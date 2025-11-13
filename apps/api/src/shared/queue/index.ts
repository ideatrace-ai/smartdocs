import amqp from "amqplib";
import { envs } from "../config/envs";

let connection: amqp.Connection | null = null;

async function connect() {
  if (connection) {
    return connection;
  }
  try {
    connection = await amqp.connect(envs.db.RABBITMQ_URL);
    console.log("🐰 Connected to RabbitMQ");
    return connection;
  } catch (error) {
    console.error("Failed to connect to RabbitMQ", error);
    connection = null;
    throw error;
  }
}

export async function publishMessage(queue: string, message: object) {
  const conn = await connect();
  if (!conn) {
    console.error("Cannot publish message, no connection to RabbitMQ.");
    return;
  }

  try {
    const channel = await conn.createChannel();
    await channel.assertQueue(queue, { durable: true });
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
    console.log(`Sent message to queue ${queue}:`, message);
    await channel.close();
  } catch (error) {
    console.error("Error publishing message to RabbitMQ", error);
  }
}

export async function consumeMessages(
  queue: string,
  onMessage: (msg: object) => Promise<void>
) {
  const conn = await connect();
  if (!conn) {
    console.error("Cannot consume messages, no connection to RabbitMQ.");
    return;
  }

  try {
    const channel = await conn.createChannel();
    await channel.assertQueue(queue, { durable: true });
    console.log(`Waiting for messages in queue: ${queue}`);

    channel.consume(
      queue,
      async (msg) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            await onMessage(content);
            channel.ack(msg);
          } catch (error) {
            console.error("Error processing message:", error);
            channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false }
    );
  } catch (error) {
    console.error("Error consuming messages from RabbitMQ", error);
  }
}
