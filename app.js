let restify = require('restify');
let builder = require('botbuilder');
let handoffHelper = require('./handoffHelper');

// Server/Bot setup
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
		session.endConversation('Echo ' + session.message.text);
	}
]);

const sendProactiveMessage = (address, message) => {
	let msg = new builder.Message().address(address);
	msg.text(message);
	bot.send(msg);
}

//triggerHandoff manually
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
			console.log(results);
			session.send('You will be connected with an agent soon.')
		}).catch((err) => {
			console.log("ERR", err);
		})
}).triggerAction({
	matches: /^agent/i,
});

let exampleRequesBody = {
	message: "",
	address: {}
}