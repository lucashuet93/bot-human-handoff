let mongoose = require('mongoose');

class MongoClient {

	constructor() {
		this.botbuilder = require('botbuilder')
		this.mongoConnection = `mongodb://teamshackfeb12lucas:${encodeURIComponent('FYcXeP2g1RTjuLWsQs6PLriJO2wNfTmkCGdPUYbXlTWJrfHhdNu9IACt9NF8nP9dlbM8WJG7sJWYAvy7oq6odA==')}@teamshackfeb12lucas.documents.azure.com:10255/?ssl=true&replicaSet=globaldb`;
		this.handoffModel = mongoose.model("Handoff", handoffSchema);
		mongoose.connect(this.mongoConnection, (err) => {
			if (err) {
				console.log('Unable to connect to the server. Please start the server. Error:', err);
			} else {
				console.log('Connected to Cosmos DB successfully!');
			}
		});
	}

	fetchHandoff(userId) {
		const query = this.handoffModel.findOne({ $or: [{ customerId: userId }, { agentId: userId }] }, { customerId: 1, customerAddress: 1, agentId: 1, agentAddress: 1, _id: 0 });
		return query.exec();
	};

	fetchWaitingCustomer() {
		const query = this.handoffModel.findOne({}, { customerId: 1, customerAddress: 1, agentId: 1, agentAddress: 1, _id: 0 });
		return query.exec();
	};

	updateHandoff(handoff) {
		const query = this.handoffModel.findOne({ customerId: handoff.customerId }, { customerId: 1, customerAddress: 1, agentId: 1, agentAddress: 1, _id: 1 });
		return query.exec()
			.then((result) => {
				if (result) {
					//edit
					result.customerAddress = handoff.customerAddress;
					result.customerId = handoff.customerId;
					result.agentAddress = handoff.agentAddress;
					result.agentId = handoff.agentId;
					return result.save();
				} else {
					//create
					return new this.handoffModel(handoff).save()
				}
			})
			.catch((err) => {
				console.log("ERR", err)
			});
	};

	deleteHandoff(userId) {
		const query = this.handoffModel.deleteOne({ $or: [{ customerId: userId }, { agentId: userId }] });
		return query.exec();
	};

	cleanDB() {
		const query = this.handoffModel.deleteMany({});
		return query.exec();
	};
}

const handoffSchema = new mongoose.Schema({
	customerId: String,
	customerAddress: Object,
	agentId: String,
	agentAddress: Object
})

module.exports = new MongoClient();