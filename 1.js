function convertToMongoDBQuery(nestedQuery) {
    let mongoDBQuery = '';
    nestedQuery = JSON.parse(nestedQuery);

    const stringifyObject = (obj) => {
        return JSON.stringify(obj, null, 2).replace(/"([^"]+)":/g, '$1:');
    };

    const processFind = (query) => {
        const resultVar = `result_${Math.random().toString(36).substr(2, 9)}`;
        mongoDBQuery += `var ${resultVar} = db.${query.collection}.find(\n`;
        mongoDBQuery += `  ${stringifyObject(query.filter || {})},\n`;
        mongoDBQuery += `  ${stringifyObject(query.projection || {})}\n`;
        mongoDBQuery += `).toArray();\n`;
        return resultVar;
    };

    const processAggregate = (query) => {
        mongoDBQuery += `db.${query.collection}.aggregate([\n`;

        query.pipeline.forEach((stage, index) => {
            if (stage.$match) {
                Object.keys(stage.$match).forEach(key => {
                    if (stage.$match[key].$in && typeof stage.$match[key].$in[0] === 'object') {
                        const nestedQueryItem = stage.$match[key].$in[0];
                        if (nestedQueryItem.operation === 'find') {
                            const resultVariable = processFind(nestedQueryItem);
                            mongoDBQuery += `var ${key}s = ${resultVariable}.map(item => item.${key});\n`;
                            stage.$match[key].$in = `${key}s`;
                        }
                    }
                });
                mongoDBQuery += `  { $match: ${stringifyObject(stage.$match)} },\n`;
            }
            if (stage.$project) {
                mongoDBQuery += `  { $project: ${stringifyObject(stage.$project)} },\n`;
            }
        });

        mongoDBQuery = mongoDBQuery.slice(0, -2) + '\n'; // Remove last comma
        mongoDBQuery += `]);\n`;
    };

    const processUpdate = (query) => {
        const filterKeys = Object.keys(query.filter);
        const nestedKey = filterKeys.find(key => query.filter[key].$in && typeof query.filter[key].$in[0] === 'object');

        if (nestedKey) {
            const nestedQueryItem = query.filter[nestedKey].$in[0];
            if (nestedQueryItem.operation === 'find') {
                const resultVariable = processFind(nestedQueryItem);
                mongoDBQuery += `db.${query.collection}.updateMany(\n`;
                mongoDBQuery += `  { ${nestedKey}: { $in: ${resultVariable}.map(item => item.${nestedKey}) } },\n`;
                mongoDBQuery += `  ${stringifyObject(query.update)}\n`;
                mongoDBQuery += `);\n`;
            }
        }
    };

    const processDelete = (query) => {
        const filterKeys = Object.keys(query.filter);
        const nestedKey = filterKeys.find(key => query.filter[key].$in && typeof query.filter[key].$in[0] === 'object');

        if (nestedKey) {
            const nestedQueryItem = query.filter[nestedKey].$in[0];
            if (nestedQueryItem.operation === 'find') {
                const resultVariable = processFind(nestedQueryItem);
                mongoDBQuery += `db.${query.collection}.deleteMany(\n`;
                mongoDBQuery += `  { ${nestedKey}: { $in: ${resultVariable}.map(item => item.${nestedKey}) } }\n`;
                mongoDBQuery += `);\n`;
            }
        }
    };

    switch (nestedQuery.operation) {
        case 'aggregate':
            processAggregate(nestedQuery);
            break;
        case 'find':
            processFind(nestedQuery);
            break;
        case 'updateMany':
            processUpdate(nestedQuery);
            break;
        case 'deleteMany':
            processDelete(nestedQuery);
            break;
        default:
            throw new Error('Unsupported operation');
    }

    return mongoDBQuery;
}

// Example usage for aggregate
const nestedAggregateQuery = `{
  "operation": "aggregate",
  "collection": "employees",
  "pipeline": [
    {
      "$match": {
        "name": {
          "$in": [
            {
              "operation": "find",
              "collection": "heros",
              "projection": {
                "name": 1
              }
            }
          ]
        }
      }
    },
    {
      "$project": {
        "first_name": 1,
        "last_name": 1,
        "salary": 1
      }
    }
  ]
}`;

console.log(convertToMongoDBQuery(nestedAggregateQuery));

// Example usage for deleteMany
const nestedDeleteQuery = `{
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
}`;

console.log(convertToMongoDBQuery(nestedDeleteQuery));