function convertMongoQueryToJSON(query) {
    // Break down the query into filter and projection
    let filter = {};
    let projection = {};
  
    Object.keys(query).forEach(key => {
      if (key === 'projection') {
        projection = query[key];
      } else {
        filter[key] = query[key];
      }
    });
  
    // Convert filter to JSON format
    const filterJson = JSON.stringify({ filter }, null, 2);
  
    // Convert projection to JSON format
    const projectionJson = JSON.stringify({ projection }, null, 2);
  
    // Combine filter and projection into a single JSON object
    const combinedJson = JSON.stringify({ filter, projection }, null, 2);
  
    return {
      filterJson,
      projectionJson
    };
  }
  
  // Example usage:
  const query = {
    $and: [{ age: 30 }, { name: "John" }]
  };
  
  const result = convertMongoQueryToJSON(query);
  
  console.log("Filter in JSON format:");
  console.log(result.filterJson);
  
  console.log("Projection in JSON format:");
  console.log(result.projectionJson);
