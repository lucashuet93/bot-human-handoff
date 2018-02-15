let builder = require('botbuilder');

class HumanHandoff {

	constructor(bot, config) {
		this.bot = bot;
		this.mongoClient = require('./MongoClient');
		this.config = config;
		this.bot.on('conversationUpdate', (message) => this.onConversationUpdate(message));
		//Middleware
		this.bot.use({
			botbuilder: (session, next) => {
				if (!session.conversationData.firstRun) {
					session.conversationData.firstRun = true;
					session.conversationData.expectingConnection = false;
				}
				this.config.isAgent(session) ? this.runAgentFlow(session, next) : this.runCustomerFlow(session, next);
			},
			send: (event, next) => {
				next();
			}
		})
		this.createCustomerDialogs();
		this.createAgentDialogs();
	}

	sendProactiveMessage(address, message) {
		let msg = new builder.Message().address(address);
		msg.text(message);
		this.bot.send(msg);
	}

	onConversationUpdate(message) {
		let botId = message.address.bot.id;
		let members = message.membersAdded ? message.membersAdded : message.membersRemoved;
		if (members.length > 0) {
			let count = 0;
			let p = new Promise((resolve, reject) => {
				members.map(m => {
					if (m.id !== botId) {
						//Humans have left or entered the one on one chat. Clear their handoff objects.
						let userId = m.id;
						this.mongoClient.deleteHandoff(userId, this.config.saveConversations, true)
							.then((handoffResults) => {
								++count;
								if (count === message.membersAdded.length) {
									resolve();
								}
							}).catch((err) => { console.log("Error1: ", err) });
					}
				})
			}).then((result) => {
				return;
			}).catch((err) => { console.log("Error: ", err) });
		}
	};

	runCustomerFlow(session, next) {
		const userId = session.message.user.id;
		this.mongoClient.fetchHandoff(userId)
			.then((results) => {
				if (results) {
					session.conversationData.expectingConnection = true;
					session.replaceDialog('/customerConnected', results);
				} else {
					if (session.conversationData.expectingConnection) {
						session.conversationData.expectingConnection = false;
						session.message.text.toLowerCase().includes(this.config.connectToAgentTriggerPhrase) ? session.replaceDialog('/connectToAgent') : session.replaceDialog(this.config.dialogToRouteToAfterDisconnect);
					} else {
						session.message.text.toLowerCase().includes(this.config.connectToAgentTriggerPhrase) ? session.replaceDialog('/connectToAgent') : next();
					}
				}
			}).catch((err) => { console.log("Error: ", err) });
	}

	createCustomerDialogs() {
		this.bot.dialog('/customerConnected', [
			(session, args, next) => {
				if (args.agentAddress) {
					if (session.message.text.toLowerCase().includes(this.config.disconnectTriggerPhrase)) {
						session.replaceDialog('/handoffConcluded', args)
					} else {
						//the customer is connected to an agent and just said something that is not a disconnect statement
						if (this.config.saveConversations) {
							let newHistory = [...args.conversationHistory];
							newHistory.push({
								timestamp: session.message.timestamp,
								userId: session.message.user.id,
								messageText: session.message.text
							})
							let handoffWithHistory = {
								customerId: args.customerId,
								customerAddress: args.customerAddress,
								agentId: args.agentId,
								agentAddress: args.agentAddress,
								conversationHistory: newHistory
							}
							this.mongoClient.updateHandoff(handoffWithHistory)
								.then((results) => {
									this.sendProactiveMessage(args.agentAddress, session.message.text);
								}).catch((err) => { console.log("Error: ", err) });

						} else {
							this.sendProactiveMessage(args.agentAddress, session.message.text);
						}
					}
				} else {
					session.send('You are in our queue. Thank you for your patience.')
				}
			}
		]);
		this.bot.dialog('/connectToAgent', [
			(session, args, next) => {
				if (this.config.isAgent(session)) {
					session.send('Sorry, it looks like you are one of our help desk agents already.')
				} else {
					const address = session.message.address;
					const customerId = session.message.user.id;
					let handoffAddress = {
						customerId: customerId,
						customerAddress: address,
						agentId: null,
						agentAddress: null,
						conversationHistory: []
					};
					this.mongoClient.updateHandoff(handoffAddress)
						.then((results) => {
							session.conversationData.expectingConnection = true;
							session.send('You will be connected with an agent soon.');
						}).catch((err) => { console.log("Error: ", err) });
				}
			}
		]);
	}

	runAgentFlow(session, next) {
		const userId = session.message.user.id;
		this.mongoClient.fetchHandoff(userId)
			.then((results) => {
				if (results) {
					session.conversationData.expectingConnection = true;
					session.replaceDialog('/agentConnected', results);
				} else {
					if (session.conversationData.expectingConnection) {
						session.conversationData.expectingConnection = false;
						session.message.text.toLowerCase().includes(this.config.connectToNextCustomerTriggerPhrase) ? session.replaceDialog('/connectToCustomer') : session.replaceDialog(this.config.dialogToRouteToAfterDisconnect);
					} else {
						session.message.text.toLowerCase().includes(this.config.connectToNextCustomerTriggerPhrase) ? session.replaceDialog('/connectToCustomer') : next();
					}
				}
			}).catch((err) => { console.log("Error: ", err) });
	}

	createAgentDialogs() {
		this.bot.dialog('/agentConnected', [
			(session, args, next) => {
				if (session.message.text.toLowerCase().includes(this.config.disconnectTriggerPhrase)) {
					session.replaceDialog('/handoffConcluded', args)
				} else {
					//the agent is connected to a customer and just said something that is not a disconnect statement
					if (this.config.saveConversations) {
						let newHistory = [...args.conversationHistory];
						newHistory.push({
							timestamp: session.message.timestamp,
							userId: session.message.user.id,
							messageText: session.message.text
						})
						let handoffWithHistory = {
							customerId: args.customerId,
							customerAddress: args.customerAddress,
							agentId: args.agentId,
							agentAddress: args.agentAddress,
							conversationHistory: newHistory
						}
						this.mongoClient.updateHandoff(handoffWithHistory)
							.then((results) => {
								this.sendProactiveMessage(args.customerAddress, session.message.text);
							}).catch((err) => { console.log("Error: ", err) });

					} else {
						this.sendProactiveMessage(args.customerAddress, session.message.text);
					}
				}
			}
		]);
		this.bot.dialog('/connectToCustomer', (session) => {
			if (this.config.isAgent(session)) {
				const address = session.message.address;
				const agentId = session.message.user.id;
				this.mongoClient.fetchWaitingCustomer()
					.then((results) => {
						if (results) {
							let handoffAddress = {
								customerId: results.customerId,
								customerAddress: results.customerAddress,
								agentId: agentId,
								agentAddress: address,
								conversationHistory: []
							};
							this.mongoClient.updateHandoff(handoffAddress)
								.then((results) => {
									session.conversationData.expectingConnection = true;
									session.send('You are connected to the customer.');
								}).catch((err) => { console.log("Error: ", err) });
						} else {
							session.send('There are no customers waiting.');
						}
					}).catch((err) => { console.log("Error: ", err) });
			}
		});
		this.bot.dialog('/handoffConcluded', [
			(session, args, next) => {
				let userId = this.config.isAgent(session) ? args.agentId : args.customerId;
				this.mongoClient.deleteHandoff(userId, this.config.saveConversations)
					.then((results) => {
						if (this.config.isAgent(session)) {
							this.sendProactiveMessage(args.customerAddress, "You have been disconnected from the agent.");
							session.send('You have been disconnected from the customer.');
						} else {
							this.sendProactiveMessage(args.agentAddress, "You have been disconnected from the customer.");
							session.send('You have been disconnected from the agent.');
						}
					}).catch((err) => { console.log("Error: ", err) });
			}
		]);
	}

}

module.exports = HumanHandoff;