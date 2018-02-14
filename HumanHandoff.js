let builder = require('botbuilder');

class HumanHandoff {

	constructor(bot) {
		this.bot = bot;
		this.mongoClient = require('./MongoClient');
		//Middleware
		this.bot.use({
			botbuilder: (session, next) => {
				const userId = session.message.user.id;
				if (this.isAgent(session)) {
					if (session.conversationData.disconnected === true) {
						session.conversationData.disconnected = false;
						session.message.text.toLowerCase().includes('connect') ? session.replaceDialog('/connectToCustomer') : session.replaceDialog('/');
					} else {
						this.mongoClient.fetchHandoffAddressFromAgentId(userId)
							.then((results) => {
								if (results) {
									session.replaceDialog('/agentConnected', results);
								} else {
									session.message.text.toLowerCase().includes('connect') ? session.replaceDialog('/connectToCustomer') : next();
								}
							})
					}
				} else {
					this.mongoClient.fetchDisconnectionForCustomerId(userId)
						.then((results) => {
							if (results) {
								this.mongoClient.deleteDisconnection(userId)
									.then((results) => {
										session.message.text.toLowerCase().includes('agent') ? session.replaceDialog('/connectToAgent') : session.replaceDialog('/');
									});
							} else {
								this.mongoClient.fetchHandoffAddressFromCustomerId(userId)
									.then((results) => {
										if (results) {
											session.replaceDialog('/customerConnected', results);
										} else {
											session.message.text.toLowerCase().includes('agent') ? session.replaceDialog('/connectToAgent') : next();
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
		this.createCustomerDialogs();
		this.createAgentDialogs();
	}

	isAgent (session) { return session.message.user.name.startsWith("Agent") };

	sendProactiveMessage (address, message) {
		let msg = new builder.Message().address(address);
		msg.text(message);
		this.bot.send(msg);
	}

	createCustomerDialogs () {
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
				if (this.isAgent(session)) {
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
						})
				}
			}
		]);
	}

	createAgentDialogs () {		
		this.bot.dialog('/agentConnected', [
			(session, args, next) => {
				if (session.message.text.toLowerCase().includes(' end ')) {
					session.replaceDialog('/handoffConcluded', args)
				} else {
					this.sendProactiveMessage(args.customerAddress, session.message.text);
				}
			}
		]);
		this.bot.dialog('/connectToCustomer', (session) => {
			if (this.isAgent(session)) {
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
								})
						} else {
							session.send('There are no customers waiting.');
						}
					})
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
							})
					})
			}
		]);
	}

}

module.exports = HumanHandoff;