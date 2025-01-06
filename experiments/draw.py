import pandas as pd
from matplotlib.dates import DateFormatter, MinuteLocator
import matplotlib.pyplot as plt
from matplotlib_venn import venn2
import numpy as np
import glob
import os, sys
from scipy import interpolate

colors = [
  plt.cm.Purples(0.9),
  plt.cm.Blues(0.9),
  plt.cm.Greens(0.9),
  plt.cm.Oranges(0.9),
  plt.cm.Reds(0.9),
]

def percentage(part, whole):
  percentage_value = 100 * float(part)/float(whole)
  return f"{percentage_value:.2f}%"

def sample_data(times, coverage, max_samples=1000):
  n = len(times)
  if n > max_samples:
    indices = np.random.choice(n, max_samples, replace=False)
    indices.sort()  # Keep original order
    times = np.array(times)[indices]
    coverage = np.array(coverage)[indices]
  return times, coverage

def draw_experiment1(name, ax, color, data, covered, overall, marker, texty):
  max_time = max(exp[0][-1] for exp in data)
  common_times = np.linspace(0, max_time, 1000)
  # marker time points is set every 30 minutes
  marker_times = np.arange(1800, max_time, 1800)
  
  interpolated_coverages = []
  for times, coverage in data:
    # times, coverage = sample_data(times, coverage)
    f = interpolate.interp1d(times, coverage, kind='linear', fill_value='extrapolate')
    interpolated_coverage = f(common_times)
    interpolated_coverages.append(interpolated_coverage)
    
  median_coverage = np.median(interpolated_coverages, axis=0)
  upper_coverage = np.max(interpolated_coverages, axis=0)
  lower_coverage = np.min(interpolated_coverages, axis=0)
  timestamps = [pd.Timestamp(t, unit='s') for t in common_times]
  ax.plot(timestamps, median_coverage, color = color)
  f = interpolate.interp1d(common_times, median_coverage, kind='linear', fill_value='extrapolate')
  ax.plot([pd.Timestamp(t, unit='s') for t in marker_times], f(marker_times), color=color, marker=marker, markersize=6, linestyle='None', label = name)
  
  ax.fill_between(timestamps, lower_coverage, upper_coverage, alpha=0.3, edgecolor=color, facecolor=color)
  # Set the x-axis to show minutes
  ax.xaxis.set_major_locator(MinuteLocator(byminute=range(0, 60, 30)))  # Tick every 30 minutes
  ax.xaxis.set_major_formatter(DateFormatter('%H:%M'))  # Format as HH:MM
  annotation_text = f'{name}:{percentage(covered, overall)}'
  bbox_props = dict(boxstyle="round,pad=0.3", fc="white", ec="black", lw=1)
  ax.text(0.85, texty, annotation_text, transform=ax.transAxes, fontsize=10,
          verticalalignment='top', bbox=bbox_props)
  plt.gcf().autofmt_xdate()

def store_fig_experiment1(ax, fig, name, ylabel, ylim):
  ax.set_xlabel('Time', fontsize = 25)
  ax.set_ylabel(ylabel, fontsize = 25)
  ax.set_ylim(ylim)
  ax.spines['right'].set_visible(False)
  ax.spines['top'].set_visible(False)
  ax.legend(fontsize=12)
  
  # Save the figures
  fig.savefig(f'experiments/coverages/{name}.pdf', format='pdf', dpi=300, bbox_inches='tight')
  fig.savefig(f'experiments/coverages/{name}.svg', format='svg', dpi=300, bbox_inches='tight')

  # Optionally, close the figures to free up memory
  plt.close(fig)

def draw_experiment1_with_setting(cov, setting, color, marker, ax, texty):
  #! collect experimental results of the trivial setting
  data = []
  overall = 0
  covered = 0
  for file in glob.glob(f'experiments/coverages/{cov}_{setting}_*.txt'):
    with open(file, 'r') as f:
      lines = f.readlines()
    coverages = [float(line.strip().split(': ')[1].strip().split('/')[0]) for line in lines]
    timestaps = [float(line.strip().split(': ')[0].strip()) for line in lines]
    data.append([timestaps, coverages])
    overall += float(lines[-1].strip().split(': ')[1].strip().split('/')[1])
    covered += float(lines[-1].strip().split(': ')[1].strip().split('/')[0])
  if glob.glob(f'experiments/coverages/{cov}_{setting}_*.txt') != []:
    draw_experiment1(setting, ax, color, data, covered, overall, marker, texty)

def draw_from_experiment1(cov, ylabel, ylim):
  fig, ax = plt.subplots(figsize = (8,5))
  draw_experiment1_with_setting(cov, 'trivial', plt.cm.Purples(0.9), 'D', ax, 0.35)
  draw_experiment1_with_setting(cov, 'gen100', plt.cm.Greens(0.9), '^', ax, 0.25)
  draw_experiment1_with_setting(cov, 'gen500', plt.cm.Blues(0.9), 'p', ax, 0.15)
  draw_experiment1_with_setting(cov, 'gen1000', plt.cm.Reds(0.9), 'o', ax, 0.05)
  store_fig_experiment1(ax, fig, f"{cov}_increase_plot", ylabel, ylim)

draw_from_experiment1('edgecov', 'Edge Coverage', (4500, 7000))
draw_from_experiment1('linecov', 'Line Coverage', (21000, 24000))