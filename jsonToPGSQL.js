function createMongoToPGConverter() {
  let cteCounter = 0;
  let ctes = [];

  function convert(jsonQuery) {
    let queryDict;
    try {
      queryDict = typeof jsonQuery === 'string' ? JSON.parse(jsonQuery) : jsonQuery;
    } catch (error) {
      return "Invalid JSON input";
    }

    const { operation, collection, pipeline, document, filter, update, options } = queryDict;

    if (!collection) {
      return "Collection is required";
    }

    switch (operation) {
      case 'insert':
        return convertInsert(collection, document);
      case 'delete':
        return convertDelete(collection, filter);
      case 'update':
        return convertUpdate(collection, filter, update, options);
      case 'select':
        return convertSelect(collection, filter, options);
      case 'aggregate':
        return convertAggregate(collection, pipeline);
      default:
        return `Unsupported operation: ${operation}`;
    }
  }

  function convertInsert(collection, document) {
    const columns = Object.keys(document);
    const values = Object.values(document).map(formatValue);
    return `INSERT INTO ${collection} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
  }

  function convertDelete(collection, filter) {
    const whereClause = filter ? `WHERE ${buildCondition(filter)}` : '';
    return `DELETE FROM ${collection} ${whereClause};`;
  }

  function convertUpdate(collection, filter, update, options = {}) {
    const whereClause = filter ? `WHERE ${buildCondition(filter)}` : '';
    const setClause = buildSetClause(update.$set || update);
    const returning = options.returnOriginal === false ? 'RETURNING *' : '';
    return `UPDATE ${collection} SET ${setClause} ${whereClause} ${returning};`;
  }

  function convertSelect(collection, filter, options = {}) {
    const whereClause = filter ? `WHERE ${buildCondition(filter)}` : '';
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
    const skipClause = options.skip ? `OFFSET ${options.skip}` : '';
    const sortClause = options.sort ? `ORDER BY ${buildSortClause(options.sort)}` : '';
    const projectionClause = options.projection ? buildProjectionClause(options.projection) : '*';
    return `SELECT ${projectionClause} FROM ${collection} ${whereClause} ${sortClause} ${limitClause} ${skipClause};`;
  }

  function convertAggregate(collection, pipeline) {
    let sqlParts = [`FROM ${collection}`];
    for (const stage of pipeline) {
      sqlParts.push(...processStage(stage));
    }
    const mainQuery = sqlParts.join(' ');
    if (ctes.length > 0) {
      const cteQueries = ctes.join(',\n');
      return `WITH ${cteQueries}\n${mainQuery};`;
    }
    return `${mainQuery};`;
  }

  function processStage(stage) {
    const [stageType] = Object.keys(stage);
    const stageContent = stage[stageType];

    switch (stageType) {
      case '$match':
        return [`WHERE ${buildCondition(stageContent)}`];
      case '$group':
        return processGroup(stageContent);
      case '$sort':
        return [`ORDER BY ${buildSortClause(stageContent)}`];
      case '$limit':
        return [`LIMIT ${stageContent}`];
      case '$skip':
        return [`OFFSET ${stageContent}`];
      case '$project':
        return processProject(stageContent);
      case '$unwind':
        return processUnwind(stageContent);
      case '$lookup':
        return processLookup(stageContent);
      case '$addFields':
        return processAddFields(stageContent);
      case '$replaceRoot':
        return processReplaceRoot(stageContent);
      case '$set':
        return processSet(stageContent);
      case '$unset':
        return processUnset(stageContent);
      case '$merge':
        return processMerge(stageContent);
      case '$out':
        return processOut(stageContent);
      case '$indexStats':
        return processIndexStats(stageContent);
      case '$collStats':
        return processCollStats(stageContent);
      case '$facet':
        return processFacet(stageContent);
      case '$bucket':
        return processBucket(stageContent);
      case '$bucketAuto':
        return processBucketAuto(stageContent);
      case '$sortByCount':
        return processSortByCount(stageContent);
      case '$count':
        return processCount(stageContent);
      case '$geoNear':
        return processGeoNear(stageContent);
      case '$graphLookup':
        return processGraphLookup(stageContent);
      case '$sample':
        return processSample(stageContent);
      default:
        return [`-- Unsupported operation: ${stageType}`];
    }
  }

  function buildCondition(condition, operator = 'AND') {
    const conditions = [];
    for (const [key, value] of Object.entries(condition)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        for (const [op, val] of Object.entries(value)) {
          switch (op) {
            case '$eq':
              conditions.push(`${key} = ${formatValue(val)}`);
              break;
            case '$ne':
              conditions.push(`${key} != ${formatValue(val)}`);
              break;
            case '$gt':
              conditions.push(`${key} > ${formatValue(val)}`);
              break;
            case '$gte':
              conditions.push(`${key} >= ${formatValue(val)}`);
              break;
            case '$lt':
              conditions.push(`${key} < ${formatValue(val)}`);
              break;
            case '$lte':
              conditions.push(`${key} <= ${formatValue(val)}`);
              break;
            case '$in':
              conditions.push(`${key} IN (${val.map(formatValue).join(', ')})`);
              break;
            case '$nin':
              conditions.push(`${key} NOT IN (${val.map(formatValue).join(', ')})`);
              break;
            case '$regex':
              conditions.push(`${key} ~ ${formatValue(val)}`);
              break;
            case '$exists':
              conditions.push(val ? `${key} IS NOT NULL` : `${key} IS NULL`);
              break;
            case '$type':
              conditions.push(`${key} IS ${formatValue(val)}`);
              break;
            case '$not':
              conditions.push(`NOT (${buildCondition(val)})`);
              break;
            case '$and':
              conditions.push(`(${buildCondition(val, 'AND')})`);
              break;
            case '$or':
              conditions.push(`(${buildCondition(val, 'OR')})`);
              break;
            case '$nor':
              conditions.push(`NOT (${buildCondition(val, 'OR')})`);
              break;
            case '$elemMatch':
              conditions.push(`${key} @> ${formatValue(val)}`);
              break;
            case '$all':
              conditions.push(`${key} @> ${formatValue(val)}`);
              break;
            case '$size':
              conditions.push(`jsonb_array_length(${key}) = ${formatValue(val)}`);
              break;
            case '$allElementsTrue':
              conditions.push(`jsonb_array_length(${key}) = ${formatValue(val)}`);
              break;
            default:
              conditions.push(`-- Unsupported operator: ${op}`);
          }
        }
      } else {
        conditions.push(`${key} = ${formatValue(value)}`);
      }
    }
    return conditions.join(` ${operator} `);
  }

  function buildSetClause(update) {
    return Object.entries(update)
      .map(([key, value]) => `${key} = ${formatValue(value)}`)
      .join(', ');
  }

  function buildSortClause(sort) {
    return Object.entries(sort)
      .map(([key, value]) => `${key} ${value === 1 ? 'ASC' : 'DESC'}`)
      .join(', ');
  }

  function buildProjectionClause(projection) {
    return Object.entries(projection)
      .filter(([_, value]) => value === 1)
      .map(([key, _]) => key)
      .join(', ');
  }

  function processGroup(groupContent) {
    const groupParts = [];
    const groupBy = [];
    for (const [key, value] of Object.entries(groupContent)) {
      if (key === '_id') {
        if (typeof value === 'string') {
          groupBy.push(value.slice(1)); // Remove leading $
        } else if (typeof value === 'object') {
          Object.values(value).forEach(v => groupBy.push(v.slice(1))); // Remove leading $
        }
      } else {
        groupParts.push(processGroupOperation(key, value));
      }
    }
    
    const selectClause = groupParts.length > 0 ? `SELECT ${groupBy.concat(groupParts).join(', ')}` : 'SELECT *';
    const groupByClause = groupBy.length > 0 ? `GROUP BY ${groupBy.join(', ')}` : '';
    return [selectClause, groupByClause];
  }

  function processGroupOperation(key, value) {
    const [op] = Object.keys(value);
    const field = value[op];
    switch (op) {
      case '$sum':
        return field === 1 ? `COUNT(*) AS ${key}` : `SUM(${field.slice(1)}) AS ${key}`;
      case '$avg':
        return `AVG(${field.slice(1)}) AS ${key}`;
      case '$min':
        return `MIN(${field.slice(1)}) AS ${key}`;
      case '$max':
        return `MAX(${field.slice(1)}) AS ${key}`;
      case '$push':
        return `ARRAY_AGG(${field.slice(1)}) AS ${key}`;
      case '$addToSet':
        return `ARRAY_AGG(DISTINCT ${field.slice(1)}) AS ${key}`;
      case '$first':
        return `MIN(${field.slice(1)}) AS ${key}`;
      case '$last':
        return `MAX(${field.slice(1)}) AS ${key}`;
      default:
        return `-- Unsupported group operation: ${op}`;
    }
  }

  function processProject(projectContent) {
    const projections = [];
    for (const [key, value] of Object.entries(projectContent)) {
      if (typeof value === 'object' && value !== null) {
        projections.push(processProjectOperation(key, value));
      } else if (typeof value === 'boolean' || value === 1) {
        if (value) {
          projections.push(key);
        }
      }
    }
    return [`SELECT ${projections.join(', ')}`];
  }

  function processProjectOperation(key, value) {
    const [op] = Object.keys(value);
    switch (op) {
      case '$substr':
        return `SUBSTRING(${value[op][0]} FROM ${value[op][1] + 1} FOR ${value[op][2]}) AS ${key}`;
      case '$concat':
        return `CONCAT(${value[op].map(formatValue).join(', ')}) AS ${key}`;
      case '$toLower':
        return `LOWER(${value[op]}) AS ${key}`;
      case '$toUpper':
        return `UPPER(${value[op]}) AS ${key}`;
      case '$trim':
        return `TRIM(${value[op]}) AS ${key}`;
      case '$ltrim':
        return `LTRIM(${value[op]}) AS ${key}`;
      case '$rtrim':
        return `RTRIM(${value[op]}) AS ${key}`;
      case '$split':
        return `SPLIT(${value[op][0]}, ${value[op][1]}) AS ${key}`;
      case '$strcasecmp':
        return `STRCMP(${value[op][0]}, ${value[op][1]}) AS ${key}`;
      case '$add':
        return `(${value[op].map(formatValue).join(' + ')}) AS ${key}`;
      case '$subtract':
        return `(${value[op][0]} - ${value[op][1]}) AS ${key}`;
      case '$multiply':
        return `(${value[op].map(formatValue).join(' * ')}) AS ${key}`;
      case '$divide':
        return `(${value[op][0]} / ${value[op][1]}) AS ${key}`;
      case '$mod':
        return `(${value[op][0]} % ${value[op][1]}) AS ${key}`;
      case '$abs':
        return `ABS(${value[op]}) AS ${key}`;
      case '$ceil':
        return `CEIL(${value[op]}) AS ${key}`;
      case '$floor':
        return `FLOOR(${value[op]}) AS ${key}`;
      case '$round':
        return `ROUND(${value[op]}) AS ${key}`;
      case '$trunc':
        return `TRUNC(${value[op]}) AS ${key}`;
      case '$exp':
        return `EXP(${value[op]}) AS ${key}`;
      case '$ln':
        return `LN(${value[op]}) AS ${key}`;
      case '$log':
        return `LOG(${value[op]}) AS ${key}`;
      case '$log2':
        return `LOG2(${value[op]}) AS ${key}`;
      case '$pow':
        return `POW(${value[op][0]}, ${value[op][1]}) AS ${key}`;
      case '$sqrt':
        return `SQRT(${value[op]}) AS ${key}`;
      case '$sin':
        return `SIN(${value[op]}) AS ${key}`;
      case '$cos':
        return `COS(${value[op]}) AS ${key}`;
      case '$tan':
        return `TAN(${value[op]}) AS ${key}`;
      case '$asin':
        return `ASIN(${value[op]}) AS ${key}`;
      case '$acos':
        return `ACOS(${value[op]}) AS ${key}`;
      case '$atan':
        return `ATAN(${value[op]}) AS ${key}`;
      case '$atan2':
        return `ATAN2(${value[op][0]}, ${value[op][1]}) AS ${key}`;
      case '$degrees':
        return `DEGREES(${value[op]}) AS ${key}`;
      case '$radians':
        return `RADIANS(${value[op]}) AS ${key}`;
      case '$dayOfYear':
        return `DAYOFYEAR(${value[op]}) AS ${key}`;
      case '$dayOfMonth':
        return `DAYOFMONTH(${value[op]}) AS ${key}`;
      case '$dayOfWeek':
        return `DAYOFWEEK(${value[op]}) AS ${key}`;
      case '$year':
        return `YEAR(${value[op]}) AS ${key}`;
      case '$month':
        return `MONTH(${value[op]}) AS ${key}`;
      case '$week':
        return `WEEK(${value[op]}) AS ${key}`;
      case '$hour':
        return `HOUR(${value[op]}) AS ${key}`;
      case '$minute':
        return `MINUTE(${value[op]}) AS ${key}`;
      case '$second':
        return `SECOND(${value[op]}) AS ${key}`;
      case '$millisecond':
        return `MILLISECOND(${value[op]}) AS ${key}`;
      case '$dateToString':
        return `DATE_FORMAT(${value[op][0]}, ${value[op][1]}) AS ${key}`;
      case '$isoDayOfWeek':
        return `DAYOFWEEK(${value[op]}) AS ${key}`;
      case '$isoWeek':
        return `WEEK(${value[op]}) AS ${key}`;
      case '$isoWeekYear':
        return `YEAR(${value[op]}) AS ${key}`;
      default:
        return `-- Unsupported project operation: ${op}`;
    }
  }

  function processUnwind(unwindContent) {
    const field = typeof unwindContent === 'string' ? unwindContent.slice(1) : unwindContent.path.slice(1);
    cteCounter++;
    const cteName = `unwind_${cteCounter}`;
    ctes.push(`${cteName} AS (SELECT *, jsonb_array_elements(${field}) AS ${field}_item FROM previous_cte)`);
    return [`SELECT * FROM ${cteName}`];
  }

  function processLookup(lookupContent) {
    const { from, localField, foreignField, as } = lookupContent;
    const joinCondition = `${localField} = ${from}.${foreignField}`;
    return [`LEFT JOIN ${from} ON ${joinCondition}`];
  }

  function processAddFields(addFieldsContent) {
    const newFields = Object.entries(addFieldsContent).map(([key, value]) => {
      if (typeof value === 'string' && value.startsWith('$')) {
        return `${value.slice(1)} AS ${key}`;
      } else {
        return `${formatValue(value)} AS ${key}`;
      }
    });
    return [`SELECT *, ${newFields.join(', ')}`];
  }

  function processReplaceRoot(replaceRootContent) {
    const newRoot = replaceRootContent.newRoot;
    if (typeof newRoot === 'string' && newRoot.startsWith('$')) {
      return [`SELECT ${newRoot.slice(1)}.*`];
    }
    return [`-- Unsupported replaceRoot operation`];
  }

  function processSet(setContent) {
    const newFields = Object.entries(setContent).map(([key, value]) => {
      if (typeof value === 'string' && value.startsWith('$')) {
        return `${value.slice(1)} AS ${key}`;
      } else {
        return `${formatValue(value)} AS ${key}`;
      }
    });
    return [`SELECT *, ${newFields.join(', ')}`];
  }

  function processUnset(unsetContent) {
    const fields = Object.keys(unsetContent);
    return [`SELECT * EXCEPT (${fields.join(', ')})`];
  }

  function processMerge(mergeContent) {
    const { into, on, let: letVariables, whenMatched, whenNotMatched } = mergeContent;
    const mergeCondition = `${on}`;
    const matchedClause = whenMatched ? `WHEN MATCHED THEN ${processUpdate(whenMatched)}` : '';
    const notMatchedClause = whenNotMatched ? `WHEN NOT MATCHED THEN ${processInsert(whenNotMatched)}` : '';
    return [`MERGE INTO ${into} ON ${mergeCondition} ${matchedClause} ${notMatchedClause}`];
  }

  function processOut(outContent) {
    const { collection, replace } = outContent;
    return [`INSERT INTO ${collection} ${replace ? 'REPLACE' : ''}`];
  }

  function processIndexStats(indexStatsContent) {
    const { collection } = indexStatsContent;
    return [`SELECT * FROM pg_stat_user_indexes WHERE schemaname = 'public' AND relname = '${collection}'`];
  }

  function processCollStats(collStatsContent) {
    const { collection } = collStatsContent;
    return [`SELECT * FROM pg_stat_user_tables WHERE schemaname = 'public' AND relname = '${collection}'`];
  }

  function processFacet(facetContent) {
    const { pipeline } = facetContent;
    return processPipeline(pipeline);
  }

  function processBucket(bucketContent) {
    const { groupBy, boundaries, default: defaultBucket } = bucketContent;
    const buckets = boundaries.map((boundary, index) => {
      const lowerBound = index === 0 ? '-Infinity' : boundaries[index - 1];
      const upperBound = index === boundaries.length - 1 ? 'Infinity' : boundary;
      return `WHEN ${groupBy} BETWEEN ${lowerBound} AND ${upperBound} THEN ${index}`;
    });
    const defaultClause = defaultBucket ? `ELSE ${defaultBucket}` : '';
    return [`CASE ${groupBy} ${buckets.join(' ')} ${defaultClause} END AS bucket`];
  }

  function processBucketAuto(bucketAutoContent) {
    const { groupBy, buckets } = bucketAutoContent;
    return [`FLOOR(${groupBy} / (${buckets.length}::float)) AS bucket`];
  }

  function processSortByCount(sortByCountContent) {
    const { groupBy } = sortByCountContent;
    return [`SELECT ${groupBy}, COUNT(*) AS count GROUP BY ${groupBy} ORDER BY count DESC`];
  }

  function processCount(countContent) {
    return [`SELECT COUNT(*) AS count`];
  }

  function processGeoNear(geoNearContent) {
    const { near, distanceField, spherical } = geoNearContent;
    const distanceFunction = spherical ? `ST_DistanceSphere` : `ST_Distance`;
    return [`SELECT *, ${distanceFunction}(${near}, geom) AS ${distanceField}`];
  }

  function processGraphLookup(graphLookupContent) {
    const { from, startWith, connectFromField, connectToField, as } = graphLookupContent;
    return [`WITH RECURSIVE ${as} AS (SELECT * FROM ${from} WHERE ${connectFromField} = ${startWith} UNION ALL SELECT ${from}.* FROM ${as} JOIN ${from} ON ${as}.${connectToField} = ${from}.${connectFromField}) SELECT * FROM ${as}`];
  }

  function processSample(sampleContent) {
    const { size } = sampleContent;
    return [`TABLESAMPLE SYSTEM (${size})`];
  }

  function processUpdate(updateContent) {
    const { update } = updateContent;
    return `UPDATE SET ${buildSetClause(update)}`;
  }

  function processInsert(insertContent) {
    const { insert } = insertContent;
    return `INSERT INTO ${insert}`;
  }

  function processPipeline(pipeline) {
    const sqlParts = [];
    for (const stage of pipeline) {
      sqlParts.push(...processStage(stage));
    }
    return sqlParts.join(' ');
  }

  function formatValue(value) {
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`; // Escape single quotes
    }
    if (typeof value === 'boolean') {
      return value.toString().toUpperCase();
    }
    if (value === null) {
      return 'NULL';
    }
    if (Array.isArray(value)) {
      return `ARRAY[${value.map(formatValue).join(', ')}]`;
    }
    if (typeof value === 'object') {
      return `'${JSON.stringify(value)}'::jsonb`;
    }
    return value.toString();
  }

  return {
    convert
  };
}
module.exports = createMongoToPGConverter; 
/*
// Example usage
const insertExample = {
    operation: 'insert',
    collection: 'users',
    document: { name: 'John Doe', age: 30, email: 'john@example.com' }
  };
 const pgsqlworker = createMongoToPGConverter();
 console.log(pgsqlworker.convert(insertExample))

// You can now use the converter like this:
// const result = converter.convert(jsonQuery);
*/