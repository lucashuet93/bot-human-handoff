let restify = require('restify');
let builder = require('botbuilder');
let handoffHelper = require('./HandoffHelper');

//-------------------------------------------SERVER/BOT SETUP-------------------------------------------

let server = restify.createServer();

server.listen(process.env.port || process.env.PORT || 3978, function () {
	console.log('%s listening to %s', server.name, server.url);
});

server.use(restify.plugins.bodyParser());

let connector = new builder.ChatConnector({
	appId: "3e881008-0b5b-49c1-b779-f78e7306d845",
	appPassword: "cdkiJGOX1393$sobQUT9~;("
});

server.post('/api/messages', connector.listen());

server.post('/proactive', (req, res) => {
	sendProactiveMessage(req.body.address, req.body.message)
	res.send(200)
});

const bot = new builder.UniversalBot(connector, [
	(session, args, next) => {
		if (isAgent(session)) {
			session.beginDialog('/userIsAgent');
		} else {
			session.beginDialog('/userIsCustomer');
		}
	}
]);

//-------------------------------------------HELPER METHODS-------------------------------------------

handoffHelper.cleanDB()
	.then((res) => {/* Do nothing. Just clearing out each time for testing purposes */ })

const isAgent = (session) => session.message.user.name.startsWith("Agent");

const sendProactiveMessage = (address, message) => {
	let msg = new builder.Message().address(address);
	msg.text(message);
	bot.send(msg);
}

//-------------------------------------------CUSTOMER DIALOGS-------------------------------------------

bot.dialog('/userIsCustomer', [
	(session, args, next) => {
		const userId = session.message.user.id;
		handoffHelper.fetchHandoffAddressFromCustomerId(userId)
			.then((results) => {
				if (results) {
					//this customer is connected
					if (results.agentAddress) {
						sendProactiveMessage(results.agentAddress, session.message.text);
					} else {
						session.endDialog('You are in our queue. Thank you for your patience.')
					}
				} else {
					//this customer is talking to the bot
					session.beginDialog('/test')
				}
			}).catch((err) => {
				console.log("ERR", err);
			})
	}
]);

bot.dialog('/connectToAgent', [
	(session, args, next) => {
		if (isAgent(session)) {
			session.endDialog('Sorry, it looks like you are one of our help desk agents already.')
		} else {
			const address = session.message.address;
			const customerId = session.message.user.id;
			let handoffAddress = {
				customerId: customerId,
				customerAddress: address,
				agentId: null,
				agentAddress: null,
			};
			handoffHelper.updateHandoffAddress(handoffAddress)
				.then((results) => {
					session.endDialog('You will be connected with an agent soon.');
				}).catch((err) => {
					console.log("ERR", err);
				});
		}
	}
]).triggerAction({
	matches: /^help/i,
});

//-------------------------------------------AGENT DIALOGS-------------------------------------------

bot.dialog('/userIsAgent', [
	(session, args, next) => {
		const userId = session.message.user.id;
		handoffHelper.fetchHandoffAddressFromAgentId(userId)
			.then((results) => {
				if (results) {
					//this agent is connected
					if (session.message.text.toLowerCase().includes(' end ')) {
						session.beginDialog('/handoffConcluded', { customerId: results.customerId })
					} else {
						sendProactiveMessage(results.customerAddress, session.message.text);
					}
				} else {
					session.beginDialog('/test')
				}
			}).catch((err) => {
				console.log("ERR", err);
			})
	}
]);

bot.dialog('/connectToCustomer', (session) => {
	if (isAgent(session)) {
		const address = session.message.address;
		const agentId = session.message.user.id;
		handoffHelper.fetchWaitingCustomer()
			.then((results) => {
				if (results) {
					let handoffAddress = {
						customerId: results.customerId,
						customerAddress: results.customerAddress,
						agentId: agentId,
						agentAddress: address
					};
					handoffHelper.updateHandoffAddress(handoffAddress)
						.then((results) => {
							session.endDialog('You are connected to the customer.');
						}).catch((err) => {
							console.log("ERR", err);
						});
				} else {
					session.endDialog('There are no customers waiting.')
				}
			}).catch((err) => {
				console.log("ERR", err);
			});
	} else {
		session.endDialog(`Hmm, I didn't quite catch that. Type 'help' to speak with a help desk agent`)
	}
}).triggerAction({
	matches: /^connect/i,
});

bot.dialog('/handoffConcluded', [
	(session, args, next) => {
		handoffHelper.deleteHandoffAddress(args.customerId)
			.then((results) => {
				session.endConversation('The customer has been removed from the queue.');
			}).catch((err) => {
				console.log("ERR", err);
			});
	}
]);

//=========================================================
// TEST Dialogs
//=========================================================

const addTwoNumbers = (one, two) => {
	return one + two;
};
const subtractTwoNumbers = (one, two) => {
	return one - two;
};

bot.dialog('/test', [
	(session, args, next) => {
		if (!session.userData.name) {
			builder.Prompts.text(session, 'Hi! What is your name?');
		} else {
			next();
		}
	},
	(session, results) => {
		if (results.response) {
			session.userData.name = results.response;
		}
		session.send('Hi %s!', session.userData.name);
		builder.Prompts.number(session, "Lets find the first number we want to work with. Enter a number");
	},
	(session, results) => {
		session.privateConversationData.numberOne = results.response;
		session.send('The first number you chose was %s', session.privateConversationData.numberOne);
		builder.Prompts.number(session, "Great, now lets find the second number we want to work with. Enter another number");
	},
	(session, results) => {
		session.privateConversationData.numberTwo = results.response;
		session.send('Perfect, the two numbers you chose were %(numberOne)s and %(numberTwo)s!', session.privateConversationData);
		builder.Prompts.choice(session, "What would you like to do with those two numbers?", ['Add', 'Subtract']);
	},
	(session, results) => {
		if (results.response.entity == 'Add') {
			session.beginDialog('/add', session.privateConversationData);
		} else {
			session.replaceDialog('/subtract', session.privateConversationData);
		}
	}
]);
bot.dialog('/add', [
	(session, args, next) => {
		session.privateConversationData = args;
		session.send('Lets add %s and %s!', session.privateConversationData.numberOne, session.privateConversationData.numberTwo);
		let value = addTwoNumbers(session.privateConversationData.numberOne, session.privateConversationData.numberTwo)
		session.send('The two numbers added together make %s!', value);
	}
]);


bot.dialog('/subtract', [
	(session, args, next) => {
		session.send('Lets subtract %s and %s!', session.privateConversationData.numberOne, session.privateConversationData.numberTwo);
		let value = subtractTwoNumbers(session.privateConversationData.numberOne, session.privateConversationData.numberTwo)
		session.send('The first number minus the second number is %s!', value);
	}
])