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
const pgsqlToJSON = require('./pgsqlToJSON')


const postgresQuery = `SELECT 
    c.customer_id,
    CONCAT(c.first_name, ' ', c.last_name) AS full_name,
    c.region,
    SUM(o.total_amount) AS total_spent,
    COUNT(o.order_id) AS total_orders,
    AVG(o.total_amount) AS average_order_value,
    MAX(o.order_date) AS last_order_date,
    COALESCE(MAX(o.last_order_date), '1970-01-01') AS formatted_last_order_date
FROM 
    customers c
LEFT JOIN 
    orders o ON c.customer_id = o.customer_id
WHERE 
    c.region IN ('North', 'South', 'East', 'West')
GROUP BY 
    c.customer_id, c.first_name, c.last_name, c.region
HAVING 
    SUM(o.total_amount) > 1000
ORDER BY 
    total_spent DESC
LIMIT 10;
`;
console.log(pgsqlToJSON(postgresQuery))
