let restify = require('restify');
let builder = require('botbuilder');
let handoffHelper = require('./handoffHelper');

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
			session.beginDialog('/userIsAgent')
		} else {
			session.beginDialog('/userIsCustomer')
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
					session.beginDialog('/unconnectedCustomer')
				}
			}).catch((err) => {
				console.log("ERR", err);
			})
	}
]);

bot.dialog('/unconnectedCustomer', [
	(session, args, next) => {
		if (session.message.text.toLowerCase().includes('agent')) {
			session.beginDialog('/connectToAgent');
		} else {
			session.endConversation('Echo ' + session.message.text);
		}
	}
]);

bot.dialog('/connectToCustomer', (session) => {
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
						session.endConversation('You are connected to the customer.');
					}).catch((err) => {
						console.log("ERR", err);
					});
			} else {
				session.send('There are no customers waiting.')
			}
		}).catch((err) => {
			console.log("ERR", err);
		});
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
					session.beginDialog('/unconnectedAgent')
				}
			}).catch((err) => {
				console.log("ERR", err);
			})
	}
]);

bot.dialog('/unconnectedAgent', [
	(session, args, next) => {
		if (session.message.text.toLowerCase().includes('connect')) {
			session.beginDialog('/connectToCustomer');
		} else {
			session.endConversation('Echo ' + session.message.text);
		}
	}
]);

bot.dialog('/connectToAgent', (session) => {
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
			session.endConversation('You will be connected with an agent soon.');
		}).catch((err) => {
			console.log("ERR", err);
		});
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