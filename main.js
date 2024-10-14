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


const postgresQuery = `
SELECT 
    c.customer_id,
    CONCAT(c.first_name, ' ', c.last_name) AS full_name,
    c.region,
    c.total_spent,
    c.total_orders,
    c.total_products,
    c.most_frequent_product,
    c.region_rank,
    c.global_rank,
    AVG(c.total_spent) OVER () AS average_spending_global,
    SUM(c.total_spent) OVER () AS total_spending_global,
    COALESCE(c.last_order_date, '1970-01-01') AS last_order_date
FROM customers c
WHERE c.total_orders > 5 AND c.region IN ('North', 'South', 'East', 'West')
GROUP BY c.customer_id, c.first_name, c.last_name, c.region, c.total_spent, c.total_orders, c.total_products, c.most_frequent_product, c.region_rank, c.global_rank, c.last_order_date
HAVING c.total_spent > (SELECT AVG(total_spent) FROM customers)
ORDER BY c.global_rank
LIMIT 10 OFFSET 5;
`;
console.log(pgsqlToJSON(postgresQuery))
