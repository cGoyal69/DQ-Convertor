// const jsonToXml = require('./jsonToXML');
// const jsonToSQL = require('./jsonToSQL');
// const sqlToJSON = require('./sqlToJSON')
const mongoToJson = require('./mongoToJSON');
const convertJsonToXml = require('./jsonToXML');
const xmlToXQuery = require('./xmlToXQuery');
// const xmlToJson = require('./xmlToJSON')
// const xmlToXQuery = require('./xmlToXQuery')
// const xqueryToXml = require('./xqueryToXML')
// const detectQueryLang = require('./detectQueryLang')
// const createMongoToPGConverter = require('./jsonToPGSQL')
// const pgsqlToJSON = require('./pgsqlToJSON')


const postgresQuery = `db.orders.aggregate([{ $match: { status: "completed" } }, { $group: { _id: "$customerId", total: { $sum: "$amount" } } }]).limit(5).sort({ total: -1 })`;
console.log(mongoToJson(postgresQuery))
console.log(convertJsonToXml(mongoToJson(postgresQuery)))
console.log(xmlToXQuery(convertJsonToXml(mongoToJson(postgresQuery))))
