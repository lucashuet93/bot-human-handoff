let mongoose = require('mongoose');

class MongoClient {

	constructor(mongoConnectionString) {
		this.botbuilder = require('botbuilder')
		this.mongoConnection = mongoConnectionString
		this.handoffModel = mongoose.model("Handoff", handoffSchema);
		this.conversationHistoryModel = mongoose.model("ConversationHistory", handoffSchema);
		mongoose.connect(this.mongoConnection, (err) => {
			if (err) {
				console.log('Unable to connect to the server. Please start the server. Error:', err);
			} else {
				console.log('Connected to Cosmos DB successfully!');
			}
		});
	}

	fetchHandoff(userId) {
		const query = this.handoffModel.findOne({ $or: [{ customerId: userId }, { agentId: userId }] }, { customerId: 1, customerAddress: 1, agentId: 1, agentAddress: 1, conversationHistory: 1, _id: 0 });
		return query.exec();
	};

	fetchWaitingCustomer() {
		const query = this.handoffModel.findOne({}, { customerId: 1, customerAddress: 1, agentId: 1, agentAddress: 1, conversationHistory: 1, _id: 0 });
		return query.exec();
	};

	updateHandoff(handoff) {
		const query = this.handoffModel.findOne({ customerId: handoff.customerId }, { customerId: 1, customerAddress: 1, agentId: 1, agentAddress: 1, conversationHistory: 1, _id: 1 });
		return query.exec()
			.then((result) => {
				if (result) {
					//edit
					result.customerAddress = handoff.customerAddress;
					result.customerId = handoff.customerId;
					result.agentAddress = handoff.agentAddress;
					result.agentId = handoff.agentId;
					result.conversationHistory = handoff.conversationHistory;
					return result.save();
				} else {
					//create
					return new this.handoffModel(handoff).save();
				}
			})
			.catch((err) => {
				console.log("ERR", err)
			});
	};

	deleteHandoff(userId, saveConversation, initialRun = false) {
		if (saveConversation === true && !initialRun) {
			return this.saveConversation(userId)
				.then((response) => {
					const query = this.handoffModel.deleteOne({ $or: [{ customerId: userId }, { agentId: userId }] });
					return query.exec();
				})
		} else {
			const query = this.handoffModel.deleteOne({ $or: [{ customerId: userId }, { agentId: userId }] });
			return query.exec();
		}
	};

	saveConversation(userId) {
		const query = this.handoffModel.findOne({ $or: [{ customerId: userId }, { agentId: userId }] }, { customerId: 1, customerAddress: 1, agentId: 1, agentAddress: 1, conversationHistory: 1, _id: 0 });
		return query.exec()
			.then((result) => {
				let conversationHistoryModel = {
					customerAddress: result.customerAddress,
					customerId: result.customerId,
					agentAddress: result.agentAddress,
					agentId: result.agentId,
					conversationHistory: result.conversationHistory
				}
				return new this.conversationHistoryModel(conversationHistoryModel).save();
			})
	}

	findHistories() {
		const query = this.conversationHistoryModel.find({}, { customerId: 1, customerAddress: 1, agentId: 1, agentAddress: 1, conversationHistory: 1, _id: 0 });
		return query.exec();
	}

	cleanDB() {
		const query = this.conversationHistoryModel.deleteMany({});
		return query.exec()
			.then((res) => {
				return this.handoffModel.deleteMany({}).exec()
			})
	}
}

const handoffSchema = new mongoose.Schema({
	customerId: String,
	customerAddress: Object,
	agentId: String,
	agentAddress: Object,
	conversationHistory: [
		{
			timestamp: String,
			userId: String,
			messageText: String
		}
	]
})

module.exports = MongoClient;