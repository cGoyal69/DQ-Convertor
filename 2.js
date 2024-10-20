const { ObjectId } = require('mongodb');


function convertToNestedQuery(mongoDBQuery) {
    const lines = mongoDBQuery.trim().split('\n');
    let nestedQuery = {};

    if (lines[0].includes('.find(')) {
        nestedQuery.operation = 'find';
        nestedQuery.collection = lines[0].split('.')[1].split('.')[0];
        nestedQuery.filter = JSON.parse(lines[1].trim());
        nestedQuery.projection = JSON.parse(lines[2].trim());
    } else if (lines[0].includes('.aggregate(')) {
        nestedQuery.operation = 'aggregate';
        nestedQuery.collection = lines[0].split('.')[1].split('.')[0];
        nestedQuery.pipeline = [];
        for (let i = 1; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            if (line.startsWith('{') && line.endsWith('},')) {
                const stage = JSON.parse(line.slice(0, -1));
                nestedQuery.pipeline.push(stage);
            }
        }
    } else if (lines[0].includes('.updateMany(')) {
        nestedQuery.operation = 'updateMany';
        nestedQuery.collection = lines[0].split('.')[1].split('.')[0];
        nestedQuery.filter = JSON.parse(lines[1].trim());
        nestedQuery.update = JSON.parse(lines[2].trim());
    } else if (lines[0].includes('.deleteMany(')) {
        nestedQuery.operation = 'deleteMany';
        nestedQuery.collection = lines[0].split('.')[1].split('.')[0];
        nestedQuery.filter = JSON.parse(lines[1].trim());
    }

    return nestedQuery;
}

function convertToMongoDBQuery(nestedQuery) {
    const stringifyObject = (obj) => {
        return JSON.stringify(obj, null, 2).replace(/"([^"]+)":/g, '$1:');
    };

    const processFind = (query) => {
        return `db.${query.collection}.find(\n` +
            `  ${stringifyObject(query.filter)},\n` +
            `  ${stringifyObject(query.projection)}\n` +
            `).toArray()`;
    };

    const processAggregate = (query) => {
        let result = `db.${query.collection}.aggregate([\n`;
        query.pipeline.forEach(stage => {
            result += `  ${stringifyObject(stage)},\n`;
        });
        result = result.slice(0, -2) + '\n'; // Remove last comma
        result += `])`;
        return result;
    };

    const processUpdate = (query) => {
        return `db.${query.collection}.updateMany(\n` +
            `  ${stringifyObject(query.filter)},\n` +
            `  ${stringifyObject(query.update)}\n` +
            `)`;
    };

    const processDelete = (query) => {
        return `db.${query.collection}.deleteMany(\n` +
            `  ${stringifyObject(query.filter)}\n` +
            `)`;
    };

    const processOperation = (query) => {
        switch (query.operation) {
            case 'find':
                return processFind(query);
            case 'aggregate':
                return processAggregate(query);
            case 'updateMany':
                return processUpdate(query);
            case 'deleteMany':
                return processDelete(query);
            default:
                throw new Error('Unsupported operation');
        }
    };

    const processNestedQueries = (obj) => {
        for (let key in obj) {
            if (Array.isArray(obj[key])) {
                obj[key] = obj[key].map(item => {
                    if (typeof item === 'object' && item !== null) {
                        if (item.operation) {
                            return processOperation(item);
                        }
                        return processNestedQueries(item);
                    }
                    return item; // return the string as is
                });
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                if (obj[key].operation) {
                    obj[key] = processOperation(obj[key]);
                } else {
                    obj[key] = processNestedQueries(obj[key]);
                }
            }
        }
        return obj;
    };

    let processedQuery = JSON.parse(JSON.stringify(nestedQuery));

    if (processedQuery.filter) {
        processedQuery.filter = processNestedQueries(processedQuery.filter);
    }

    return processOperation(processedQuery);
}

function validateConversion(original, converted, conversionType) {
    const normalizeQuery = (query) => {
        if (typeof query === 'string') {
            return query.replace(/\s/g, '').replace(/ObjectId\((.*?)\)/g, '"$1"');
        } else {
            return JSON.stringify(query, (key, value) => {
                if (typeof value === 'function') {
                    return value.toString();
                }
                return value;
            }).replace(/\s/g, '');
        }
    };

    if (conversionType === 'mongoToNested') {
        const reconverted = convertToNestedQuery(converted);
        return normalizeQuery(original) === normalizeQuery(reconverted);
    } else if (conversionType === 'nestedToMongo') {
        const reconverted = convertToMongoDBQuery(converted);
        return normalizeQuery(original) === normalizeQuery(reconverted);
    } else {
        throw new Error('Invalid conversion type');
    }
}

// Test the conversion
const nestedQuery = {
    "operation": "deleteMany",
    "collection": "users",
    "filter": {
        "order_id": {
            "$in": [
                {
                    "operation": "find",
                    "collection": "order_items",
                    "projection": {
                        "order_id": 1
                    },
                    "filter": {
                        "$and": [
                            {
                                "product_id": {
                                    "$eq": 123
                                }
                            },
                            {
                                "name": {
                                    "$in": [
                                        "Kavyaa",
                                        "Lakshita",
                                        "'Cou"
                                    ]
                                }
                            }
                        ]
                    }
                }
            ]
        }
    }
};

const convertedToMongo = convertToMongoDBQuery(nestedQuery);
console.log('Nested to MongoDB:');
console.log(convertedToMongo);
console.log('Validation:', validateConversion(nestedQuery, convertedToMongo, 'nestedToMongo'));

const mongoQuery = `db.order_items.find(
  {
  $and: [
    {
      product_id: {
        $eq: 123
      }
    },
    {
      name: {
        $in: [
          "Kavyaa",
          "Lakshita",
          "'Cou"
        ]
      }
    }
  ]
},
  {
  order_id: 1
}
).toArray();
db.users.deleteMany(
  { order_id: { $in: result.map(item => item.order_id) } }
)`;

const convertedToNested = convertToNestedQuery(mongoQuery);
console.log('\nMongoDB to Nested:');
console.log(JSON.stringify(convertedToNested, null, 2));
console.log('Validation:', validateConversion(mongoQuery, convertedToNested, 'mongoToNested'));
