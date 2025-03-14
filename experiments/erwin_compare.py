
from datetime import datetime
import matplotlib.pyplot as plt
from collections import defaultdict

def calculate_seconds_gap(time_str1, time_str2):
  # Define the format matching your date string
  date_format = "%Y-%m-%d_%H:%M:%S"
  
  # Parse both time strings to datetime objects
  time1 = datetime.strptime(time_str1, date_format)
  time2 = datetime.strptime(time_str2, date_format)
  
  # Calculate the time difference in seconds
  delta = time1 - time2
  return abs(int(delta.total_seconds()))

def extract_datetime(filename):
  parts = filename.split('_')
  return parts[1] + '_' + ':'.join(parts[2].split(':')[:-1])

def parse_custom_datetime(datetime_str):
  try:
    # Replace the last colon in time with a dot to handle milliseconds
    date_part, time_part = datetime_str.split('_')
    time_parts = time_part.split(':')
    if len(time_parts) == 4:
      time_reformatted = f"{':'.join(time_parts[:3])}.{time_parts[3]}"
      datetime_str = f"{date_part}_{time_reformatted}"
      return datetime.strptime(datetime_str, "%Y-%m-%d_%H:%M:%S.%f")
    return datetime.strptime(datetime_str, "%Y-%m-%d_%H:%M:%S")
  except Exception as e:
    raise ValueError(f"Invalid datetime format: {datetime_str}") from e

def calculate_seconds_gap_ext(filename1, filename2):
  datetime_str1 = extract_datetime(filename1)
  datetime_str2 = extract_datetime(filename2)
  
  time1 = parse_custom_datetime(datetime_str1)
  time2 = parse_custom_datetime(datetime_str2)
  
  delta = time1 - time2
  return abs(round(delta.total_seconds(), 3))  # Preserve milliseconds as decimal

erwin_start_time = "2025-1-4_8:00:00"
erwin_trivial_start_time = "2025-1-25_16:00:00"

with open("test_programs/erwin_bugs.csv", "r") as f:
  lines = f.readlines()
  erwin_time = []
  erwin_bugid = []
  # erwin_time.append(extract_datetime(lines[0].split(' ')[0].strip()))
  for line in lines[1:]:
    erwin_time.append(extract_datetime(line.split(',')[2]))
    erwin_bugid.append(line.split(',')[0])
  erwin_time = [calculate_seconds_gap(time, erwin_start_time) for time in erwin_time]

with open('test_programs/erwin_trivial_bugs.csv', 'r') as f:
  lines = f.readlines()
  erwin_trivial_time = []
  erwin_trivial_bugid = []
  for line in lines:
    erwin_trivial_time.append(extract_datetime(line.split(',')[2]))
    erwin_trivial_bugid.append(line.split(',')[0])
  erwin_trivial_time = [calculate_seconds_gap(time, erwin_trivial_start_time) for time in erwin_trivial_time]

print(erwin_time)
print(erwin_bugid)
print(erwin_trivial_time)
print(erwin_trivial_bugid)

fuzzer1_times = erwin_time
fuzzer1_bugs = erwin_bugid
fuzzer2_times = erwin_trivial_time
fuzzer2_bugs = erwin_trivial_bugid

# Sort data by timestamp and generate cumulative counts
fuzzer1_sorted = sorted(zip(fuzzer1_times, fuzzer1_bugs), key=lambda x: x[0])
fuzzer2_sorted = sorted(zip(fuzzer2_times, fuzzer2_bugs), key=lambda x: x[0])

# Convert timestamps to days
SECONDS_PER_DAY = 86400
f1_times = [t / SECONDS_PER_DAY for t, _ in fuzzer1_sorted]
f1_counts = list(range(1, len(f1_times) + 1))
f2_times = [t / SECONDS_PER_DAY for t, _ in fuzzer2_sorted]
f2_counts = list(range(1, len(f2_times) + 1))

# Get unique bugs and assign distinct markers
all_bugs = list(set(fuzzer1_bugs + fuzzer2_bugs))
markers = ['o', 's', 'D', '^', 'v', '<', '>', 'p', '*', 'h', 'H', 'd', 'P', 'X', '8', '+', 'x', '1', '2', '3', '4']
bug_to_marker = {bug: markers[i % len(markers)] for i, bug in enumerate(all_bugs)}

# Group bugs by ID for each fuzzer (with time in days)
f1_bug_groups = defaultdict(list)
for idx, (t, bug) in enumerate(fuzzer1_sorted):
    f1_bug_groups[bug].append((t / SECONDS_PER_DAY, f1_counts[idx]))  # Convert to days

f2_bug_groups = defaultdict(list)
for idx, (t, bug) in enumerate(fuzzer2_sorted):
    f2_bug_groups[bug].append((t / SECONDS_PER_DAY, f2_counts[idx]))  # Convert to days

# Plot
plt.figure(figsize=(20, 8))

# Step lines for cumulative trends (now in days)
plt.step(f1_times, f1_counts, where='post', color='blue', label='Erwin', alpha=0.4, linestyle='--', linewidth=4)
plt.step(f2_times, f2_counts, where='post', color='red', label='Erwin Trivial', alpha=0.4, linestyle='-.', linewidth=4)

# Plot markers for Fuzzer 1 bugs (already in days)
for bug, points in f1_bug_groups.items():
    x = [p[0] for p in points]
    y = [p[1] for p in points]
    plt.scatter(x, y, marker=bug_to_marker[bug], s=300, color='blue',
                edgecolor='black', label=f'_nolegend_')

# Plot markers for Fuzzer 2 bugs (already in days)
for bug, points in f2_bug_groups.items():
    x = [p[0] for p in points]
    y = [p[1] for p in points]
    plt.scatter(x, y, marker=bug_to_marker[bug], s=300, color='red',
                edgecolor='black', label=f'_nolegend_')

# Highlight unique bugs (encircling rings)
unique_to_f1 = set(fuzzer1_bugs) - set(fuzzer2_bugs)
for bug, points in f1_bug_groups.items():
    if bug in unique_to_f1:
        x = [p[0] for p in points]
        y = [p[1] for p in points]
        plt.scatter(x, y, marker='o', s=1500, facecolors='none', 
                    edgecolors='red', linewidths=2.5, zorder=3)

# Legend setup
legend_elements = [
    plt.Line2D([], [], color='blue', linestyle='--', label='Erwin'),
    plt.Line2D([], [], color='red', linestyle='-.', label='Erwin Trivial'),
    plt.Line2D([], [], marker='o', markersize=15, markeredgecolor='red',
               markerfacecolor='none', linestyle='None', markeredgewidth=2,
               label='Unique to Erwin (Encircled)')
]

# Axis labels and formatting
plt.xlim(-1, 20)
plt.xticks(range(0, 21))
plt.xlabel('Day', fontsize=30)
plt.ylabel('Cumulative Bugs Found', fontsize=30)
plt.xticks(fontsize=30)
plt.yticks(fontsize=30)
plt.legend(handles=legend_elements, loc='lower right', fontsize=30)
plt.grid(True, linestyle='--', alpha=0.6)
plt.tight_layout()
plt.savefig('diagrams/erwin_erwin_trivial.pdf', format='pdf', dpi=300, bbox_inches='tight')