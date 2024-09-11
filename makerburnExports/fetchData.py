import requests
from datetime import datetime, date
import json
import os
from datetime import timedelta

def fetch_data():
    url = "https://api.makerburn.com/expenses/accounting"
    response = requests.get(url)
    return response.json()

def process_data(data):
    monthly_expenses = {}
    monthly_expenses_no_launch = {}
    monthly_expenses_by_cu = {}  # New dictionary for CU ID grouping
    monthly_expenses_filtered = {}  # New dictionary for filtered expenses
    excluded_cu_ids = ["DEWIZ", "ECOSYSTEM", "IS-001", "PH-001", "PHOENIX", "PNT-001", "PULLUP", "SF-001", "SIDESTREAM", "TECH-001", "VIRIDIAN"]
    
    for transaction in data:
        if transaction['token'] == 'DAI':
            date = datetime.strptime(transaction['datetime'], "%Y-%m-%dT%H:%M:%S.%fZ")
            month_key = date.strftime("%Y/%m")
            cu_id = transaction.get('cu_id', 'Unknown')  # Use 'Unknown' if cu_id is not present
            
            if month_key not in monthly_expenses:
                monthly_expenses[month_key] = 0
                monthly_expenses_no_launch[month_key] = 0
                monthly_expenses_by_cu[month_key] = {}
                monthly_expenses_filtered[month_key] = 0
            
            monthly_expenses[month_key] += transaction['dai_amount']
            
            if cu_id != 'LAUNCH' and cu_id != 'INTERIM':
                monthly_expenses_no_launch[month_key] += transaction['dai_amount']
            
            if cu_id not in excluded_cu_ids:
                monthly_expenses_filtered[month_key] += transaction['dai_amount']
            
            # Group by CU ID
            if cu_id not in monthly_expenses_by_cu[month_key]:
                monthly_expenses_by_cu[month_key][cu_id] = 0
            monthly_expenses_by_cu[month_key][cu_id] += transaction['dai_amount']
    
    return monthly_expenses, monthly_expenses_no_launch, monthly_expenses_by_cu, monthly_expenses_filtered

def format_output(monthly_expenses):
    # Generate all months from 2021-01 to current month
    start_date = date(2021, 1, 1)
    end_date = datetime.now().date().replace(day=1)
    current_date = start_date
    
    series = []
    while current_date <= end_date:
        month_key = current_date.strftime("%Y/%m")
        value = monthly_expenses.get(month_key, 0)  # Use 0 if no data for the month
        series.append({
            "period": month_key,
            "rows": [{"value": value}]  # Remove rounding
        })
        current_date = (current_date.replace(day=1) + timedelta(days=32)).replace(day=1)
    
    output = {
        "data": {
            "analytics": {
                "series": series
            }
        }
    }
    
    return output

def format_output_by_cu(monthly_expenses_by_cu):
    # Generate all months from 2021-01 to current month
    start_date = date(2021, 1, 1)
    end_date = datetime.now().date().replace(day=1)
    current_date = start_date
    
    series = []
    while current_date <= end_date:
        month_key = current_date.strftime("%Y/%m")
        cu_data = monthly_expenses_by_cu.get(month_key, {})
        rows = [{"cu_id": cu_id, "value": value} for cu_id, value in cu_data.items()]
        series.append({
            "period": month_key,
            "rows": rows
        })
        current_date = (current_date.replace(day=1) + timedelta(days=32)).replace(day=1)
    
    output = {
        "data": {
            "analytics": {
                "series": series
            }
        }
    }
    
    return output

def main():
    data = fetch_data()
    monthly_expenses, monthly_expenses_no_launch, monthly_expenses_by_cu, monthly_expenses_filtered = process_data(data)
    output = format_output(monthly_expenses)
    output_no_launch = format_output(monthly_expenses_no_launch)
    output_by_cu = format_output_by_cu(monthly_expenses_by_cu)
    output_filtered = format_output(monthly_expenses_filtered)
    
    current_date = datetime.now().strftime("%Y-%m-%d")
    folder_name = f"makerBurnExport_{current_date}"
    
    # Create a new folder with the current date
    folder_path = os.path.join('makerburnExports', folder_name)
    os.makedirs(folder_path, exist_ok=True)
    
    # Define filenames
    filenames = {
        "all": "makerBurnExport.json",
        "no_launch": "makerBurnExport_no_launchOrInterim.json",
        "by_cu": "makerBurnExport_by_cu.json",
        "filtered": "makerBurnExport_filtered.json"
    }
    
    # Write the files to the new folder
    for key, filename in filenames.items():
        filepath = os.path.join(folder_path, filename)
        with open(filepath, 'w') as f:
            if key == "by_cu":
                json.dump(output_by_cu, f, indent=4, separators=(',', ': '))
            elif key == "no_launch":
                json.dump(output_no_launch, f, indent=4, separators=(',', ': '))
            elif key == "filtered":
                json.dump(output_filtered, f, indent=4, separators=(',', ': '))
            else:
                json.dump(output, f, indent=4, separators=(',', ': '))
    
    print(f"Data exported to {folder_path}")

if __name__ == "__main__":
    main()
