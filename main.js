// const jsonToXml = require('./jsonToXML');
// const jsonToSQL = require('./jsonToSQL');
const jsonToMongo = require('./4');
// const sqlToJSON = require('./sqlToJSON')
const mongoToJson = require('./3');
// const xmlToJson = require('./xmlToJSON')
// const xmlToXQuery = require('./xmlToXQuery')
// const xqueryToXml = require('./xqueryToXML')
// const detectQueryLang = require('./detectQueryLang')
// const createMongoToPGConverter = require('./jsonToPGSQL')
// const pgsqlToJSON = require('./pgsqlToJSON')


const postgresQuery = `db.orders.aggregate([{ $match: { status: "completed" } }, { $group: { _id: "$customerId", total: { $sum: "$amount" } } }]).limit(5).sort({ total: -1 })`;
console.log(mongoToJson(postgresQuery))
console.log(jsonToMongo(mongoToJson(postgresQuery)))
