let restify = require('restify');
let builder = require('botbuilder');
let mongoClient = require('./MongoClient');

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

const bot = new builder.UniversalBot(connector);

bot.use({
	botbuilder: (session, next) => {
		const userId = session.message.user.id;
		if (isAgent(session)) {
			if (session.conversationData.disconnected === true) {
				session.conversationData.disconnected = false;
				session.replaceDialog('/');
			} else {
				mongoClient.fetchHandoffAddressFromAgentId(userId)
					.then((results) => {
						if (results) {
							session.replaceDialog('/agentConnected', results);
						} else {
							session.message.text.toLowerCase().includes('connect') ? session.replaceDialog('/connectToCustomer') : next();
						}
					})
			}
		} else {
			mongoClient.fetchDisconnectionForCustomerId(userId)
				.then((results) => {
					if (results) {
						mongoClient.deleteDisconnection(userId)
							.then((results) => {
								session.replaceDialog('/');
							});
					} else {
						mongoClient.fetchHandoffAddressFromCustomerId(userId)
							.then((results) => {
								if (results) {
									session.replaceDialog('/customerConnected', results);
								} else {
									if (session.message.text.toLowerCase().includes('agent')) {
										session.replaceDialog('/connectToAgent')
									} else {
										next();
									}
								}
							})
					}
				})
		}
	},
	send: (event, next) => {
		next();
	}
})

//-------------------------------------------HELPER METHODS-------------------------------------------

mongoClient.cleanDB()
	.then((res) => {/* Do nothing. Just clearing out each time for testing purposes */ })

const isAgent = (session) => session.message.user.name.startsWith("Agent");

const sendProactiveMessage = (address, message) => {
	let msg = new builder.Message().address(address);
	msg.text(message);
	bot.send(msg);
}

//-------------------------------------------CUSTOMER DIALOGS-------------------------------------------

bot.dialog('/customerConnected', [
	(session, args, next) => {
		//this customer is connected
		if (args.agentAddress) {
			sendProactiveMessage(args.agentAddress, session.message.text);
		} else {
			session.send('You are in our queue. Thank you for your patience.')
		}
	}
]);

bot.dialog('/connectToAgent', [
	(session, args, next) => {
		if (isAgent(session)) {
			session.send('Sorry, it looks like you are one of our help desk agents already.')
		} else {
			const address = session.message.address;
			const customerId = session.message.user.id;
			let handoffAddress = {
				customerId: customerId,
				customerAddress: address,
				agentId: null,
				agentAddress: null,
			};
			mongoClient.updateHandoffAddress(handoffAddress)
				.then((results) => {
					session.send('You will be connected with an agent soon.');
				})
		}
	}
])

//-------------------------------------------AGENT DIALOGS-------------------------------------------

bot.dialog('/agentConnected', [
	(session, args, next) => {
		if (session.message.text.toLowerCase().includes(' end ')) {
			session.replaceDialog('/handoffConcluded', args)
		} else {
			sendProactiveMessage(args.customerAddress, session.message.text);
		}
	}
]);

bot.dialog('/connectToCustomer', (session) => {
	if (isAgent(session)) {
		const address = session.message.address;
		const agentId = session.message.user.id;
		mongoClient.fetchWaitingCustomer()
			.then((results) => {
				if (results) {
					let handoffAddress = {
						customerId: results.customerId,
						customerAddress: results.customerAddress,
						agentId: agentId,
						agentAddress: address
					};
					mongoClient.updateHandoffAddress(handoffAddress)
						.then((results) => {
							session.send('You are connected to the customer.');
						})
				} else {
					session.send('There are no customers waiting.');
				}
			})
	}
})

bot.dialog('/handoffConcluded', [
	(session, args, next) => {
		mongoClient.deleteHandoffAddress(args.customerId)
			.then((results) => {
				let disconnection = {
					customerId: args.customerId,
					agentId: args.agentId
				}
				mongoClient.createDisconnection(disconnection)
					.then((results) => {
						session.conversationData.disconnected = true;
						sendProactiveMessage(args.customerAddress, "You have been disconnected from the agent.");
						session.send('You have been disconnected from the customer.');
					})
			})
	}
]);

//=========================================================
// Test Dialogs
//=========================================================

const addTwoNumbers = (one, two) => {
	return one + two;
};
const subtractTwoNumbers = (one, two) => {
	return one - two;
};

bot.dialog('/', [
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
			session.replaceDialog('/add', session.privateConversationData);
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
]);

bot.dialog('/test', [
	(session, args, next) => {
		session.endDialog('testing');
	}
]).triggerAction({
	matches: /^test/i,
});