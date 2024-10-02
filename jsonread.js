function extractFilterAndProjectionFromFind(findQuery) {
  // Assuming the findQuery is a two-parameter array: [filter, projection]
  const [filter, projection] = findQuery;

  // Returning the filter and projection objects
  return {
    filter: filter || {},       // If no filter is provided, return an empty object
    projection: projection || {}  // If no projection is provided, return an empty object
  };
}

// Example usage:
const findQuery = [ {}, { name: 1, age: 1, _id: 0 } ]
const result = extractFilterAndProjectionFromFind(findQuery);

// Correct logging
console.log("Filter in object format:");
console.log(result.filter);

console.log("Projection in object format:");
console.log(result.projection);