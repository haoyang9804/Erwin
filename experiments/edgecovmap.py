import os
from collections import defaultdict, namedtuple
import json
import sys

# Extract edge coverages from llvm-cov JSON file
def extract_collected_edges(coverage_data) -> dict :
  position = namedtuple('Position', ['function_name', 'line_start', 'column_start', 'line_end', 'column_end'])
  collected_edges = defaultdict(int)
  # Iterate through the functions in the coverage data
  for function in coverage_data['data'][0]['functions']:
    function_name = function['name']
    # Check if the function has collected edges
    if 'branches' in function:
      for branch in function['branches']:
        # https://github.com/llvm/llvm-project/blob/34f8573a514915222630cf21e8a0c901a25f4ca0/llvm/tools/llvm-cov/CoverageExporterJson.cpp#L96
        collected_edges[position(function_name, branch[0],branch[1],branch[2],branch[3])] = branch[4]
  return collected_edges

with open('./coverages/coverage_data0.json', 'r') as f:
  coverage_data = json.load(f)  
collected_edges1 = extract_collected_edges(coverage_data)
with open('./coverages/edgecovmap_trivial.txt', 'w') as f:
  for edge, count in collected_edges1.items():
    if count > 0:
      f.write(f'{edge}\n')

with open('./coverages/coverage_data1.json', 'r') as f:
  coverage_data = json.load(f)  
collected_edges1 = extract_collected_edges(coverage_data)
with open('./coverages/edgecovmap_gen50.txt', 'w') as f:
  for edge, count in collected_edges1.items():
    if count > 0:
      f.write(f'{edge}\n')

with open('./coverages/coverage_data2.json', 'r') as f:
  coverage_data = json.load(f)  
collected_edges1 = extract_collected_edges(coverage_data)
with open('./coverages/edgecovmap_gen100.txt', 'w') as f:
  for edge, count in collected_edges1.items():
    if count > 0:
      f.write(f'{edge}\n')

with open('./coverages/coverage_data3.json', 'r') as f:
  coverage_data = json.load(f)  
collected_edges1 = extract_collected_edges(coverage_data)
with open('./coverages/edgecovmap_gen150.txt', 'w') as f:
  for edge, count in collected_edges1.items():
    if count > 0:
      f.write(f'{edge}\n')

with open('./coverages/coverage_data_unittest.json', 'r') as f:
  coverage_data = json.load(f)  
collected_edges2 = extract_collected_edges(coverage_data)
with open('./coverages/edgecovmap_unittest.txt', 'w') as f:
  for edge, count in collected_edges2.items():
    if count > 0:
      f.write(f'{edge}\n')

with open('./coverages/coverage_data_acf.json', 'r') as f:
  coverage_data = json.load(f)  
collected_edges2 = extract_collected_edges(coverage_data)
with open('./coverages/edgecovmap_acf.txt', 'w') as f:
  for edge, count in collected_edges2.items():
    if count > 0:
      f.write(f'{edge}\n')

with open('./coverages/coverage_data_fuzzol.json', 'r') as f:
  coverage_data = json.load(f)  
collected_edges2 = extract_collected_edges(coverage_data)
with open('./coverages/edgecovmap_fuzzol.txt', 'w') as f:
  for edge, count in collected_edges2.items():
    if count > 0:
      f.write(f'{edge}\n')