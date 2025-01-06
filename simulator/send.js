#!/usr/bin/env node

var amqp = require('amqplib/callback_api');
if (process.argv.length < 3) {
   console.log("Error: need to specify an argument: p1 or p2.");
}

var queue = process.argv[2];
if (!(queue === "p1" || queue === "p2")) {
    throw "Queue must be p1 or p2";
}

// Generates a random integer between min (inclusive) and max (inclusive)
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min; 
}

function getRandomChoice() {
  const action = Math.random() < 0.5 ? "move" : "switch";

  let value;
  if (action === "move") {
    value = getRandomInt(1, 4); // Random number between 1 and 4
  } else {
    value = getRandomInt(1, 6); // Random number between 1 and 6
  }

  return `${action} ${value}`;
}

amqp.connect('amqp://localhost', function(error0, connection) {
    if (error0) {
        throw error0;
    }
    connection.createChannel(function(error1, channel) {
        if (error1) {
            throw error1;
        }

        var msg = getRandomChoice();

        channel.assertQueue(queue, {
            durable: false
        });
        channel.sendToQueue(queue, Buffer.from(msg));

        console.log(" [x] Sent %s", msg);
    });
    setTimeout(function() {
        connection.close();
        process.exit(0);
    }, 500);
});

