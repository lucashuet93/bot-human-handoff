let mongoose = require('mongoose');

class MongoClient {

	constructor() {
		this.botbuilder = require('botbuilder')
		this.mongoConnection = `mongodb://teamshackfeb12lucas:${encodeURIComponent('FYcXeP2g1RTjuLWsQs6PLriJO2wNfTmkCGdPUYbXlTWJrfHhdNu9IACt9NF8nP9dlbM8WJG7sJWYAvy7oq6odA==')}@teamshackfeb12lucas.documents.azure.com:10255/?ssl=true&replicaSet=globaldb`;
		this.handoffAddressSchema = mongoose.model("HandoffAddress", handoffAddress);
		this.disconnectionSchema = mongoose.model("Disconnection", disconnection);
		mongoose.connect(this.mongoConnection, (err) => {
			if (err) {
				console.log('Unable to connect to the server. Please start the server. Error:', err);
			} else {
				console.log('Connected to Cosmos DB successfully!');
			}
		});
	}

	fetchHandoffAddressFromCustomerId(customerId) {
		const query = this.handoffAddressSchema.findOne({ customerId }, { customerId: 1, customerAddress: 1, agentId: 1, agentAddress: 1, _id: 0 });
		return query.exec();
	};

	fetchHandoffAddressFromAgentId(agentId) {
		const query = this.handoffAddressSchema.findOne({ agentId }, { customerId: 1, customerAddress: 1, agentId: 1, agentAddress: 1, _id: 0 });
		return query.exec();
	};

	fetchWaitingCustomer() {
		const query = this.handoffAddressSchema.findOne({}, { customerId: 1, customerAddress: 1, agentId: 1, agentAddress: 1, _id: 0 });
		return query.exec();
	};

	updateHandoffAddress(handoffAddress) {
		const query = this.handoffAddressSchema.findOne({ customerId: handoffAddress.customerId }, { customerId: 1, customerAddress: 1, agentId: 1, agentAddress: 1, _id: 1 });
		return query.exec()
			.then((result) => {
				if (result) {
					//edit
					result.customerAddress = handoffAddress.customerAddress;
					result.customerId = handoffAddress.customerId;
					result.agentAddress = handoffAddress.agentAddress;
					result.agentId = handoffAddress.agentId;
					return result.save();
				} else {
					//create
					return new this.handoffAddressSchema(handoffAddress).save()
				}
			})
			.catch((err) => {
				console.log("ERR", err)
			});
	};

	deleteHandoffAddress(userId) {
		const query = this.handoffAddressSchema.deleteOne({ $or: [{ customerId: userId }, { agentId: userId }] });
		return query.exec();
	};

	cleanDB() {
		const query = this.handoffAddressSchema.deleteMany({});
		return query.exec();
	};

	///Disconnections

	createDisconnection(disconnection) {
		return new this.disconnectionSchema(disconnection).save();
	}

	fetchDisconnectionForCustomerId(customerId) {
		const query = this.disconnectionSchema.findOne({ customerId }, { customerId: 1, agentId: 1, _id: 0 });
		return query.exec();
	}

	deleteDisconnection(userId) {
		const query = this.disconnectionSchema.deleteOne({ $or: [{ customerId: userId }, { agentId: userId }] });
		return query.exec();
	}
}

const handoffAddress = new mongoose.Schema({
	customerId: String,
	customerAddress: Object,
	agentId: String,
	agentAddress: Object,
})

const disconnection = new mongoose.Schema({
	customerId: String,
	agentId: String,
})

module.exports = new MongoClient();