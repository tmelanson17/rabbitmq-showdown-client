#!/usr/bin/env node

const Sim = require('pokemon-showdown');
var amqp = require('amqplib/callback_api');

stream = new Sim.BattleStream();

(async () => {
    for await (const output of stream) {
        // Split output by line.
        const lines = output.split('\n');

        // Check if first line is sideupdate.
        if (lines[0].startsWith('sideupdate')) {
            // Get side.
            const side = lines[1];
            console.log(`${side} has updated.`);

            // Get player.
            const player = side === 'p1' ? 'Alice' : 'Bob';

            // Get hidden state.
            const state = lines[2].split('|')[2];

            // Log player and health.
            console.log(`${player} state: ${state}.`);
        }

        // If the first line is update, print to both players.
        if (lines[0].startsWith('update')) {
            // Log all lines except the first one.
            lines.slice(1).forEach(line => console.log(line));
        }
    }
})();

stream.write(`>start {"formatid":"gen7randombattle"}`);
stream.write(`>player p1 {"name":"Alice"}`);
stream.write(`>player p2 {"name":"Bob"}`);

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

            writer(channel, queue);
        });
    });
}

connector('p1');
connector('p2');
