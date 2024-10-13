const jsonToXml = require('./jsonToXML');
const jsonToSQL = require('./jsonToSQL');
const jsonToMongo = require('./jsonToMongo');
const sqlToJSON = require('./sqlToJSON')
const mongoToJSON = require('./mongoToJSON');
const xmlToJson = require('./xmlToJSON')
const xmlToXQuery = require('./xmlToXQuery')
const xqueryToXml = require('./xqueryToXML')
const detectQueryLang = require('./detectQueryLang')
const createMongoToPGConverter = require('./jsonToPGSQL')

const insertExample = {
  operation: 'insert',
  collection: 'users',
  document: { name: 'John Doe', age: 30, email: 'john@example.com' }
};
const pgsqlworker = createMongoToPGConverter();
console.log(pgsqlworker.convert(insertExample))
