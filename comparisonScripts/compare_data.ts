import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function getLatestExportFolder(basePath: string): Promise<string> {
  const exportsPath = path.join(basePath, 'ecosystemApiExports');
  const folders = await fs.readdir(exportsPath);
  const sortedFolders = folders.sort((a, b) => b.localeCompare(a));
  return path.join(exportsPath, sortedFolders[0]);
}

async function readJsonFile(filePath: string): Promise<any> {
  const fileContent = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(fileContent);
}

interface ComparisonResult {
  accuracy: number;
  totalDifference: number;
  monthsWithDifferences: { month: string; difference: number; testValue: number; comparedValue: number }[];
}

async function compareFiles(file1Path: string, file2Path: string): Promise<ComparisonResult> {
  const file1Data = await readJsonFile(file1Path);
  const file2Data = await readJsonFile(file2Path);

  const file1Series = file1Data.data.analytics.series;
  const file2Series = file2Data.data.analytics.series;

  let matchCount = 0;
  let totalCount = 0;
  let totalDifference = 0;
  let monthsWithDifferences: { month: string; difference: number; testValue: number; comparedValue: number }[] = [];

  for (const period1 of file1Series) {
    const period2 = file2Series.find((p: { period: string }) => p.period === period1.period);
    if (period2 && new Date(period1.period) >= new Date('2023-01-01')) {
      const sum1 = period1.rows.reduce((sum: number, row: any) => sum + row.value, 0);
      const sum2 = period2.rows.reduce((sum: number, row: any) => sum + row.value, 0);
      const difference = sum1 - sum2;

      if (sum1 === sum2) {
        matchCount++;
      } else if (Math.abs(difference) >= 1.0) {
        monthsWithDifferences.push({ 
          month: period1.period, 
          difference,
          testValue: sum1,
          comparedValue: sum2
        });
      }
      totalCount++;
      totalDifference += difference;
    }
  }

  const accuracy = totalCount > 0 ? (matchCount / totalCount) * 100 : 0;

  return {
    accuracy,
    totalDifference,
    monthsWithDifferences
  };
}

const validToAddresses = [
  "0xc37e6d18ee56440b186257968a295eb54036821a",
  "0x3f2494c872d15b022016544d1226a08f7fde63f4",
  "0x2bc5ffc5de1a83a9e4cddfa138baed516d70414b",
  "0x8ec63fe682c0703e4eb6d6ff8a154f5535f80260",
  "0x19891541842162ad4311f14055e7221406213d67",
  "0x2ffd0ac509512f3a31111e42da1a0f8fb0240227",
  "0x42ad911c75d25e21727e45eca2a9d999d5a7f94c",
  "0xf737c76d2b358619f7ef696cf3f94548fecec379",
  "0x852c61ab6f70e5fbacdfb55ebe73a8d2ccaf4649",
  "0x948777676ed54390889c219489927939d51a805a",
  "0xa1e62c6321eed0ecfcf2f382c8c82fd940d83c07"
].map(address => address.toLowerCase());

async function fetchDAITransactions(address: string): Promise<{ [key: string]: number }> {
  const etherscanApiKey = process.env.ETHERSCAN_KEY;
  if (!etherscanApiKey) {
    throw new Error('ETHERSCAN_KEY not found in .env file');
  }
  const daiContractAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
  const url = `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${daiContractAddress}&address=${address}&sort=asc&apikey=${etherscanApiKey}`;

  try {
    const response = await axios.get(url);
    const transactions = response.data.result;

    const monthlyCounterpartySums: { [key: string]: { [counterparty: string]: number } } = {};
    const monthlySums: { [key: string]: number } = {};

    transactions.forEach((tx: any) => {
      if (validToAddresses.includes(tx.to.toLowerCase())) {
        const date = new Date(parseInt(tx.timeStamp) * 1000);
        const monthKey = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
        const value = parseInt(tx.value) / 1e18;
        const counterparty = tx.to.toLowerCase();

        if (!monthlyCounterpartySums[monthKey]) {
          monthlyCounterpartySums[monthKey] = {};
        }
        monthlyCounterpartySums[monthKey][counterparty] = (monthlyCounterpartySums[monthKey][counterparty] || 0) + value;
        
        monthlySums[monthKey] = (monthlySums[monthKey] || 0) + value;
      }
    });

    console.log('Monthly DAI transaction sums for address', address);
    Object.entries(monthlyCounterpartySums)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([month, counterpartySums]) => {
        console.log(`\n${month}:`);
        console.log(`  Total: ${monthlySums[month].toFixed(2)} DAI`);
        Object.entries(counterpartySums).forEach(([counterparty, sum]) => {
          console.log(`  ${counterparty}: ${sum.toFixed(2)} DAI`);
        });
      });

    return monthlySums;
  } catch (error) {
    console.error('Error fetching DAI transactions:', error);
    return {};
  }
}

async function main() {
  const basePath = '/Users/teepteep/GitHub/maker-data-qa';
  const latestExportFolder = await getLatestExportFolder(basePath);

  console.log(`Selecting file1 from folder: ${latestExportFolder}`);

  const file1Path = path.join(latestExportFolder, '001-netProtocolOutflow/monthlyHistoricalLod1.json');
  const file2Path = path.join(basePath, 'queries', '001-netProtocolOutflow', 'monthlyHistoricalLod1.test.json');

  const result = await compareFiles(file1Path, file2Path);

  console.log(`Accuracy: ${Math.round(result.accuracy)}%`);
  console.log(`Total difference: ${Math.round(result.totalDifference)}`);
  console.log('Months with significant differences (≥1.0):');
  
  const monthlyDifferences: { [key: string]: number } = {};
  result.monthsWithDifferences.forEach(({ month, difference, testValue, comparedValue }) => {
    const formattedMonth = month.replace('-', '/');
    console.log(`${formattedMonth}: Difference: ${Math.round(difference)}, Test: ${Math.round(testValue)}, Compared: ${Math.round(comparedValue)}`);
    monthlyDifferences[formattedMonth] = Math.round(difference);
  });

  const daiTransactions = await fetchDAITransactions('0x3C5142F28567E6a0F172fd0BaaF1f2847f49D02F');

  console.log('\nComparison of differences:');
  Object.entries(daiTransactions).forEach(([month, total]) => {
    const fileDifference = monthlyDifferences[month] || 0;
    const comparisonDifference = fileDifference - total;
    console.log(`${month}: ${fileDifference} - ${Math.round(total)} = ${Math.round(comparisonDifference)}`);
  });
}

main().catch(console.error);