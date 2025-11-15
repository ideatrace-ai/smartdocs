import amqp, {
  type Connection,
  type Channel,
  type ConsumeMessage,
} from "amqplib";
import { envs } from "../../config/envs";

let connection: Connection | null = null;

async function connect(): Promise<Connection> {
  if (connection) {
    return connection;
  }
  try {
    connection = (await amqp.connect(
      envs.db.RABBITMQ_URL,
    )) as any as Connection;

    connection.on("error", (err) => {
      console.error("RabbitMQ connection error:", err);
      connection = null;
    });
    connection.on("close", () => {
      console.log("RabbitMQ connection closed.");
      connection = null;
    });

    console.log("Connected to RabbitMQ");
    return connection;
  } catch (error) {
    console.error("Failed to connect to RabbitMQ", error);
    connection = null;
    throw error;
  }
}

export const queueService = {
  async publish(queue: string, message: object): Promise<void> {
    try {
      const conn = await connect();
      const channel: Channel = await (conn as any).createChannel();
      await channel.assertQueue(queue, { durable: true });
      channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
        persistent: true,
      });
      console.log(`Sent message to queue ${queue}:`, message);
      await channel.close();
    } catch (error) {
      console.error(`Error publishing message to queue ${queue}:`, error);
    }
  },

  async consume(
    queue: string,
    onMessage: (msg: any) => Promise<void>,
  ): Promise<void> {
    try {
      const conn = await connect();
      const channel: Channel = await (conn as any).createChannel();
      await channel.assertQueue(queue, { durable: true });
      console.log(`Waiting for messages in queue: ${queue}`);

      channel.consume(
        queue,
        async (msg: ConsumeMessage | null) => {
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
        { noAck: false },
      );
    } catch (error) {
      console.error(`Error consuming messages from queue ${queue}:`, error);
    }
  },
};
