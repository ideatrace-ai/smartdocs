import amqp, {
  type Connection,
  type Channel,
  type ConsumeMessage,
} from "amqplib";
import { envs } from "../../config/envs";

let connection: Connection | null = null;
let isReconnecting = false;

const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 10;

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
      scheduleReconnect();
    });
    connection.on("close", () => {
      console.log("RabbitMQ connection closed.");
      connection = null;
    });

    console.log("Connected to RabbitMQ");
    isReconnecting = false;
    return connection;
  } catch (error) {
    console.error("Failed to connect to RabbitMQ", error);
    connection = null;
    throw error;
  }
}

function scheduleReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;

  let attempt = 0;
  const tryReconnect = async () => {
    attempt++;
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `RabbitMQ: failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`,
      );
      isReconnecting = false;
      return;
    }
    try {
      console.log(`RabbitMQ reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}...`);
      await connect();
    } catch {
      setTimeout(tryReconnect, RECONNECT_DELAY_MS * attempt);
    }
  };
  setTimeout(tryReconnect, RECONNECT_DELAY_MS);
}

const DEAD_LETTER_EXCHANGE = "dlx.smartdocs";
const DEAD_LETTER_QUEUE = "q.dead-letter";

async function setupDeadLetterExchange(channel: Channel): Promise<void> {
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, "fanout", {
    durable: true,
  });
  await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
  await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, "");
}

export const queueService = {
  async publish(queue: string, message: object): Promise<void> {
    const conn = await connect();
    const channel: Channel = await (conn as any).createChannel();

    try {
      await setupDeadLetterExchange(channel);
      await channel.assertQueue(queue, {
        durable: true,
        arguments: {
          "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE,
        },
      });
      channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
        persistent: true,
      });
      console.log(`Sent message to queue ${queue}:`, message);
    } finally {
      await channel.close();
    }
  },

  async consume(
    queue: string,
    onMessage: (msg: any) => Promise<void>,
  ): Promise<void> {
    const conn = await connect();
    const channel: Channel = await (conn as any).createChannel();

    await setupDeadLetterExchange(channel);
    await channel.assertQueue(queue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE,
      },
    });
    await channel.prefetch(1);
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
            // Send to dead-letter queue instead of silently discarding
            channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false },
    );
  },
};
