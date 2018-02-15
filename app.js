let restify = require('restify');
let builder = require('botbuilder');
let mongoClient = require('./MongoClient');
let HumanHandoff = require('./HumanHandoff');

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

//=========================================================
// Human Handoff Setup
//=========================================================

let handoffConfig = {
	isAgent: (session) => { return session.message.user.name.startsWith("Agent") },
	connectToAgentTriggerPhrase: 'agent',
	connectToNextCustomerTriggerPhrase: 'connect',
	disconnectTriggerPhrase: 'end call',
	dialogToRouteToAfterDisconnect: '/',
	saveConversations: true
}
const humanHandoff = new HumanHandoff(bot, handoffConfig);

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