#!/usr/bin/env node

const Sim = require('pokemon-showdown');
var amqp = require('amqplib/callback_api');

stream = new Sim.BattleStream();

(async () => {
    for await (const output of stream) {
        console.log(output);
    }
})();

stream.write(`>start {"formatid":"gen7randombattle"}`);
stream.write(`>player p1 {"name":"Alice"}`);
stream.write(`>player p2 {"name":"Bob"}`);

writer = function(channel, queue) {
    channel.assertQueue(queue, {
        durable: false
    });
    
    console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", queue);

    channel.consume(queue, function(msg) {
        console.log(" [x] Received %s", msg.content.toString());
	stream.write(`>${queue} ${msg.content.toString()}`);
    }, {
        noAck: true
    });
}

connector = function(queue) {
amqp.connect('amqp://localhost', function(error0, connection) {
    if (error0) {
        throw error0;
    }
    connection.createChannel(function(error1, channel) {
        if (error1) {
            throw error1;
        }

        writer(channel, queue);	
    });
});
}

connector('p1');
connector('p2');
