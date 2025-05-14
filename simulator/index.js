#!/usr/bin/env node

// @argument --stream <id> The ID of this battle stream. Used for running multiple battles in parallel.
const streamArgIndex = process.argv.indexOf('--stream');
if (streamArgIndex === -1 || streamArgIndex + 1 >= process.argv.length) {
    console.error('Error: --stream argument is required.');
    process.exit(1);
}
const queueIndex = process.argv[streamArgIndex + 1];

const Sim = require('pokemon-showdown');
var amqp = require('amqplib/callback_api');

stream = new Sim.BattleStream();

const PlayerNames = {
    p1: 'Alice',
    p2: 'Bob'
};
const QueuesFromPlayer = {
    p1: 'p1',
    p2: 'p2'
};
const QueuesToPlayer = {
    p1: 'from_p1',
    p2: 'from_p2'
};

publishMessage = function (channel, queue, message) {
    channel.assertQueue(queue, {
        durable: false
    });
    channel.sendToQueue(queue, Buffer.from(message));
    console.log(" [x] Sent %s", message);
}

streamReader = async (channel) => {
    for await (const output of stream) {
        // Split output by line.
        const lines = output.split('\n');

        // Check if first line is sideupdate.
        if (lines[0].startsWith('sideupdate')) {
            // Get side.
            const side = lines[1];
            console.log(`${side} has updated.`);

            // Get player.
            const player = PlayerNames[side];

            // Get hidden state.
            const state = lines[2].split('|')[2];

            // Log player and health.
            console.log(`${player} state: ${state}.`);

            // Check if state contains "[Invalid choice]".
            if (state.includes('[Invalid choice]')) {
                console.log(`${player} has made an invalid choice.`);
                publishMessage(channel, QueuesToPlayer[side], 'invalid');
            } else {
                // Publish to player queue.
                publishMessage(channel, QueuesToPlayer[side], state);
            }

        }

        // If the first line is update, print to both players.
        if (lines[0].startsWith('update')) {
            // Log all lines except the first one.
            lines.slice(1).forEach(line => console.log(line));
            var state = lines.slice(1).join('\n');
            // TODO: Update this to use global player names.
            publishMessage(channel, QueuesToPlayer.p1, state);
            publishMessage(channel, QueuesToPlayer.p2, state);
        }
    }
};


writer = function (channel, queue) {
    channel.assertQueue(queue, {
        durable: false
    });

    console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", queue);

    channel.consume(queue, function (msg) {
        console.log(" [x] Received %s", msg.content.toString());
        stream.write(`>${queue} ${msg.content.toString()}`);
    }, {
        noAck: true
    });

}

connector = function (queue) {
    amqp.connect('amqp://localhost', function (error0, connection) {
        if (error0) {
            throw error0;
        }
        connection.createChannel(function (error1, channel) {
            if (error1) {
                throw error1;
            }

            var queueName = `${queue}-battle-${queueIndex}`;
            writer(channel, queueName);
        });
    });
}

// TODO: Generate the queue so that multiple streams are in parallel.
stream.write(`>start {"formatid":"gen8randombattle"}`);
Object.entries(PlayerNames).forEach(([side, player]) => {
    stream.write(`>player ${side} {"name":"${player}"}`);
    connector(QueuesFromPlayer[side]);
});
console.log("Connected to RabbitMQ");
amqp.connect('amqp://localhost', function (error0, connection) {
    console.log("Connected stream reader");
    if (error0) {
        throw error0;
    }
    connection.createChannel(async function (error1, channel) {
        if (error1) {
            throw error1;
        }

        streamReader(channel);
    });
});
