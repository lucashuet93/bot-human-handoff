let builder = require('botbuilder');

class HumanHandoff {

	constructor(bot, config) {
		this.bot = bot;
		this.mongoClient = require('./MongoClient');
		this.config = config;
		//Middleware
		this.bot.use({
			botbuilder: (session, next) => {
				const userId = session.message.user.id;
				if (this.config.isAgent(session)) {
					if (session.conversationData.disconnected === true) {
						session.conversationData.disconnected = false;
						session.message.text.toLowerCase().includes(this.config.connectToNextCustomerTriggerPhrase) ? session.replaceDialog('/connectToCustomer') : session.replaceDialog(this.config.dialogToRouteToAfterDisconnect);
					} else {
						this.mongoClient.fetchHandoffAddressFromAgentId(userId)
							.then((results) => {
								if (results) {
									session.replaceDialog('/agentConnected', results);
								} else {
									session.message.text.toLowerCase().includes(this.config.connectToNextCustomerTriggerPhrase) ? session.replaceDialog('/connectToCustomer') : next();
								}
							}).catch((err) => { console.log("Error: ", err) });
					}
				} else {
					this.mongoClient.fetchDisconnectionForCustomerId(userId)
						.then((results) => {
							if (results) {
								this.mongoClient.deleteDisconnection(userId)
									.then((results) => {
										session.message.text.toLowerCase().includes(this.config.connectToAgentTriggerPhrase) ? session.replaceDialog('/connectToAgent') : session.replaceDialog(this.config.dialogToRouteToAfterDisconnect);
									}).catch((err) => { console.log("Error: ", err) });
							} else {
								this.mongoClient.fetchHandoffAddressFromCustomerId(userId)
									.then((results) => {
										if (results) {
											session.replaceDialog('/customerConnected', results);
										} else {
											session.message.text.toLowerCase().includes(this.config.connectToAgentTriggerPhrase) ? session.replaceDialog('/connectToAgent') : next();
										}
									}).catch((err) => { console.log("Error: ", err) });
							}
						}).catch((err) => { console.log("Error: ", err) });
				}
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

	createCustomerDialogs() {
		this.bot.dialog('/customerConnected', [
			(session, args, next) => {
				//this customer is connected
				if (args.agentAddress) {
					this.sendProactiveMessage(args.agentAddress, session.message.text);
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
					};
					this.mongoClient.updateHandoffAddress(handoffAddress)
						.then((results) => {
							session.send('You will be connected with an agent soon.');
						}).catch((err) => { console.log("Error: ", err) });
				}
			}
		]);
	}

	createAgentDialogs() {
		this.bot.dialog('/agentConnected', [
			(session, args, next) => {
				if (session.message.text.toLowerCase().includes(this.config.disconnectFromCustomerTriggerPhrase)) {
					session.replaceDialog('/handoffConcluded', args)
				} else {
					this.sendProactiveMessage(args.customerAddress, session.message.text);
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
								agentAddress: address
							};
							this.mongoClient.updateHandoffAddress(handoffAddress)
								.then((results) => {
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
				this.mongoClient.deleteHandoffAddress(args.customerId)
					.then((results) => {
						let disconnection = {
							customerId: args.customerId,
							agentId: args.agentId
						}
						this.mongoClient.createDisconnection(disconnection)
							.then((results) => {
								session.conversationData.disconnected = true;
								this.sendProactiveMessage(args.customerAddress, "You have been disconnected from the agent.");
								session.send('You have been disconnected from the customer.');
							}).catch((err) => { console.log("Error: ", err) });
					}).catch((err) => { console.log("Error: ", err) });
			}
		]);
	}

}

module.exports = HumanHandoff;