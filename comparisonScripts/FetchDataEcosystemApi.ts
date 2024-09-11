import { readFile, writeFile, mkdir } from 'fs/promises';
import axios from 'axios';

async function fetchGraphQLData(query: string, variables: any) {
  const response = await axios.post('https://ecosystem-dashboard.herokuapp.com/graphql', 
    { query, variables },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.FLIPSIDE_API_KEY || '',
      },
    }
  );

  // Filter out dimensions with 0 values from the response
  const filteredData = filterZeroDimensions(response.data);
  return filteredData;
}

function filterZeroDimensions(data: any): any {
  if (Array.isArray(data)) {
    return data.map(filterZeroDimensions).filter(Boolean);
  } else if (typeof data === 'object' && data !== null) {
    if (data.rows) {
      // Filter rows
      data.rows = data.rows.filter((row: any) => {
        return row.value !== 0 && row.value !== undefined && row.value !== null;
      });
    }
    
    const filteredObj: { [key: string]: any } = {};
    for (const [key, value] of Object.entries(data)) {
      const filteredValue = filterZeroDimensions(value);
      if (filteredValue !== null && filteredValue !== undefined) {
        filteredObj[key] = filteredValue;
      }
    }
    return Object.keys(filteredObj).length > 0 ? filteredObj : null;
  }
  return data;
}

async function runQueryAndSaveResult(queryPath: string, variablesPath: string, outputPath: string) {
  const query = await readFile(queryPath, 'utf-8');
  const variables = JSON.parse(await readFile(variablesPath, 'utf-8'));
  const apiData = await fetchGraphQLData(query, variables);
  await writeFile(outputPath, JSON.stringify(apiData, null, 2));
  console.log(`Results saved to: ${outputPath}`);
}

async function runQueryAndSaveResultNoLaunch(queryPath: string, variablesPath: string, outputPath: string) {
  const query = await readFile(queryPath, 'utf-8');
  const variables = JSON.parse(await readFile(variablesPath, 'utf-8'));
  const apiData = await fetchGraphQLData(query, variables);

  console.log('API Data received:', JSON.stringify(apiData, null, 2));

  // Check if the expected data structure exists
  if (!apiData || !apiData.data || !apiData.data.analytics || !apiData.data.analytics.series) {
    console.error('Unexpected API response structure');
    throw new Error('Unexpected API response structure');
  }

  const excludedCodes = ["DEW-001", "ECO-001", "IS-001", "PH-001", "PHX-001", "PNT-001", "PUL-001", "SF-001", "SSA-001", "TCH-001", "VPAC-001"];

  // Process and sum up the data
  const periodSum: { [key: string]: number } = {};
  apiData.data.analytics.series.forEach((seriesItem: any) => {
    const period = seriesItem.period;
    console.log(`Processing period: ${period}`);
    seriesItem.rows.forEach((row: any) => {
      console.log(`Row:`, JSON.stringify(row, null, 2));
      if (typeof row.value === 'number' && row.dimensions && row.dimensions[0].path) {
        const shouldInclude = !excludedCodes.some(code => row.dimensions[0].path.includes(code));
        console.log(`Should include: ${shouldInclude}, Path: ${row.dimensions[0].path}`);
        if (shouldInclude) {
          periodSum[period] = (periodSum[period] || 0) + row.value;
          console.log(`Updated sum for ${period}: ${periodSum[period]}`);
        }
      } else {
        console.log('Skipping row due to missing or invalid data');
      }
    });
  });

  console.log('Final periodSum:', periodSum);

  // Format the data to match the Lod1 normal file structure
  const formattedData = {
    data: {
      analytics: {
        series: Object.entries(periodSum).map(([period, value]) => ({
          period,
          rows: [{ value }]
        }))
      }
    }
  };

  console.log('Formatted data:', JSON.stringify(formattedData, null, 2));

  await writeFile(outputPath, JSON.stringify(formattedData, null, 2));
  console.log(`Results saved to: ${outputPath}`);
}

async function main() {
  const basePath = '/Users/teepteep/GitHub/maker-data-qa';
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputFolder = `${basePath}/ecosystemApiExports/${today}/001-netProtocolOutflow`;

  try {
    await mkdir(outputFolder, { recursive: true });
    console.log(`Created folder: ${outputFolder}`);

    // Run and save monthlyCurrentLod1 query
    await runQueryAndSaveResult(
      `${basePath}/queries/001-netProtocolOutflow/monthlyHistoricalLod1.gql`,
      `${basePath}/queries/001-netProtocolOutflow/monthlyCurrentLod1.json`,
      `${outputFolder}/monthlyCurrentLod1.json`
    );

    // Run and save monthlyHistoricalLod1 query
    await runQueryAndSaveResult(
      `${basePath}/queries/001-netProtocolOutflow/monthlyHistoricalLod1.gql`,
      `${basePath}/queries/001-netProtocolOutflow/monthlyHistoricalLod1.json`,
      `${outputFolder}/monthlyHistoricalLod1.json`
    );

    // Run and save Lod5 query
    await runQueryAndSaveResult(
      `${basePath}/queries/001-netProtocolOutflow/monthlyHistoricalLod5.gql`,
      `${basePath}/queries/001-netProtocolOutflow/monthlyHistoricalLod5.json`,
      `${outputFolder}/monthlyHistoricalLod5.json`
    );

    // Run and save monthlyHistoricalLod1_NoLaunch query
    await runQueryAndSaveResultNoLaunch(
      `${basePath}/queries/001-netProtocolOutflow/monthlyHistoricalLod5.gql`,
      `${basePath}/queries/001-netProtocolOutflow/monthlyHistoricalLod5.json`,
      `${outputFolder}/monthlyHistoricalLod1_NoLaunch.json`
    );

    console.log('All queries completed and results saved.');
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();
