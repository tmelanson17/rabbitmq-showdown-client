#!/usr/bin/env node
const Sim = require('pokemon-showdown');
var amqp = require('amqplib/callback_api');
const { info } = require('console');


/* 
* BattleManager class
*/

const PlayerNames = {
    p1: 'Alice',
    p2: 'Bob'
};
const QueuesFromPlayer = {
    p1: 'from_p1',
    p2: 'from_p2'
};
const QueuesToPlayer = {
    p1: 'p1',
    p2: 'p2'
};

class BattleManager {
    constructor(format) {
        this.stream = new Sim.BattleStream();
        this.stream.write(`>start {"formatid":"${format}"}`);
        this.createPlayers();
    }

    // Create players for both sides.
    createPlayers = function () {
        for (const [side, player] of Object.entries(PlayerNames)) {
            this.stream.write(`>player ${side} {"name":"${player}"}`);
        }
    }


    handleMessage = function (side, msg_string) {
        console.log("Side %s received %s", side, msg_string);
        this.stream.write(`>${side} ${msg_string}`);
    }

    streamReader = async (publisher) => {
        for await (const output of this.stream) {
            // Split output by line.
            const lines = output.split('\n');
            console.log("Received lines:");
            lines.forEach(line => console.log(line));
            console.log("End of lines.");


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
                    publisher(side, 'invalid');
                } else {
                    // Publish to player queue.
                    publisher(side, state);
                }

            }

            // If the first line is update, print to both players.
            if (lines[0].startsWith('update')) {
                // Log all lines except the first one.
                lines.slice(1).forEach(line => console.log(line));
                var state = lines.slice(1).join('\n');
                // TODO: Update this to use global player names.
                // TODO: Why doesn't this publish the full state in get queue?
                publisher("p1", state);
                publisher("p2", state);
            }
        }
    };
}

/*
*  End of BattleManager class
*/

const battleQueue = 'battle-request';
const infoQueueName = 'battle-info';
publishMessage = function (channel, queue, message) {
    channel.assertQueue(queue, {
        durable: false
    });
    channel.sendToQueue(queue, Buffer.from(message));
    console.log(" [x] Sent %s to queue %s", message, queue);
}


// Keep a list of BattleManager instances.
let battleManagers = [];
let toPlayerQueues = [];
let fromPlayerQueues = [];

// Spawn a battle.
function spawnBattle(connection, format) {
    // Create a battle manager for the game.
    const battleIdx = battleManagers.length;
    const battleManager = new BattleManager(format);

    // Create a channel for listening to and spawning battles.
    connection.createChannel(async function (error1, channel) {
        if (error1) {
            throw error1;
        }


        // Initialize list of queues.
        fromPlayerQueues.push(Object.fromEntries(
            Object.entries(QueuesFromPlayer).map(
                ([side, queue]) => [side, `battle-${battleIdx}-${queue}`]
            )
        ));
        toPlayerQueues.push(Object.fromEntries(
            Object.entries(QueuesToPlayer).map(
                ([side, queue]) => [side, `battle-${battleIdx}-${queue}`]
            )
        ));

        // Publish to info queue with player queue names.
        channel.assertQueue(infoQueueName, {
            durable: false
        });
        const info = {
            "fromPlayerQueues": fromPlayerQueues[battleIdx],
            "toPlayerQueues": toPlayerQueues[battleIdx],
            "battleIdx": battleIdx,
        }
        console.log("Sending the queue names to the info queue: %s", JSON.stringify(info));
        channel.sendToQueue(infoQueueName, Buffer.from(JSON.stringify(info)));

        // Create a lambda to call publishMessage.
        const publisher = (side, message) => {
            console.log("Publishing message %s to side %s", message, side);
            publishMessage(channel, toPlayerQueues[battleIdx][side], message);
        };

        battleManagers.push(battleManager);


        console.log("Listening to Showdown stream...");
        battleManager.streamReader(publisher);

        // Set up queues for each player.
        Object.entries(fromPlayerQueues[battleIdx]).forEach(([side, queue]) => {
            channel.assertQueue(queue, {
                durable: false
            });
            console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", queue);
            channel.consume(queue, function (msg) {
                battleManager.handleMessage(side, msg.content.toString());
            }, {
                noAck: true
            });
        });

    });
}

// Connect to RabbitMQ and create a channel for creating battles.
amqp.connect('amqp://localhost', function (error0, connection) {
    console.log("Connected stream reader");
    if (error0) {
        throw error0;
    }

    // Create a channel for spawning battles.
    connection.createChannel(function (error1, channel) {
        if (error1) {
            throw error1;
        }

        // Create a queue for spawning battles.
        channel.assertQueue(battleQueue, {
            durable: false
        });
        console.log(" [*] Waiting for battle requests in %s. To exit press CTRL+C", battleQueue);
        channel.consume(battleQueue, function (msg) {
            console.log(" [x] Received request to battle in %s", msg.content.toString());
            spawnBattle(connection, msg.content.toString());
        }, {
            noAck: true
        });
    });

});
