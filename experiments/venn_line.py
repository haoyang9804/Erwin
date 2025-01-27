import matplotlib.pyplot as plt
from matplotlib_venn import venn2, venn3
import matplotlib.patches as patches

# Read the data
with open('./coverages/linecovmap_unittest.txt', 'r') as f:
    lines_unittest = set(f.read().splitlines())
with open('./coverages/linecovmap_gen50_0.txt', 'r') as f:
    lines_gen50_0 = set(f.read().splitlines())
with open('./coverages/linecovmap_acf_unittest.txt', 'r') as f:
    lines_acf = set(f.read().splitlines())

# Set up the figure
plt.figure(figsize=(10, 7))
# plt.title("Code Coverage Comparison", fontsize=16, fontweight='bold')

# Create the Venn diagram
v = venn2([lines_unittest, lines_gen50_0], ('Unittest', 'Erwin'))

# Define colors and hatches with wider intervals
colors = ['#ff9999', '#66b3ff', '#99ff99', '#ffcc99', '#ff99cc', '#99ccff', '#ffff99', '#cc99ff']
hatches = ['/', '\\', '|', '-', '+', 'x', 'o', 'O', '.', '*']

# Customize the Venn diagram
for i, id in enumerate(['10', '01', '11']):
    if v.get_patch_by_id(id):
        patch = v.get_patch_by_id(id)
        if id != '11':  # Not intersection
            patch.set_facecolor(colors[i])
            patch.set_hatch(hatches[i])
        else:  # Intersection
            patch.set_facecolor('white')
            # patch.set_hatch('-')  # Increased number of 'x' for wider intervals
        patch.set_edgecolor('black')
        patch.set_linewidth(2)
        patch.set_alpha(0.6)

# Customize labels
for text in v.set_labels:
    text.set_fontsize(16)
    text.set_fontweight('bold')

for text in v.subset_labels:
    text.set_fontsize(15)

# Add a legend with wider hatching intervals
unittest_patch = patches.Patch(facecolor=colors[0], hatch=hatches[0], label='Unittest', alpha=0.6, edgecolor='black')
erwin_patch = patches.Patch(facecolor=colors[1], hatch=hatches[1], label='Erwin', alpha=0.6, edgecolor='black')
intersection_patch = patches.Patch(facecolor='white', label='Intersection', alpha=0.6, edgecolor='black')
plt.legend(handles=[unittest_patch, erwin_patch, intersection_patch], loc=(0.8, 0), fontsize=14)

# Add additional information
total_lines = len(lines_unittest.union(lines_gen50_0))
plt.text(0.5, -0.1, f"Total Unique Lines Covered: {total_lines}", 
         ha='center', va='center', transform=plt.gca().transAxes, fontsize=14)

# Adjust layout
plt.tight_layout()

# Save figures
plt.savefig('./diagrams/linecov_difference_erwin_unittest.pdf', format='pdf', dpi=300, bbox_inches='tight')
plt.savefig('./diagrams/linecov_difference_erwin_unittest.svg', format='svg', dpi=300, bbox_inches='tight')

plt = plt.figure(figsize=(10, 7))

v = venn3([lines_unittest, lines_gen50_0, lines_acf], ('Unittest', 'Erwin', 'ACF'))
for i, id in enumerate(['100', '010', '001', '110', '101', '011', '111']):
    if v.get_patch_by_id(id):
        patch = v.get_patch_by_id(id)
        if id != '111':  # Not intersection
            patch.set_facecolor(colors[i])
            patch.set_hatch(hatches[i])
        else:  # Intersection
            patch.set_facecolor('white')
        patch.set_edgecolor('black')
        patch.set_linewidth(2)
        patch.set_alpha(0.6)

for text in v.set_labels:
    text.set_fontsize(16)
    text.set_fontweight('bold')

for text in v.subset_labels:
    text.set_fontsize(15)

unittest_patch = patches.Patch(facecolor=colors[0], hatch=hatches[0], label='Unittest', alpha=0.6, edgecolor='black')
erwin_patch = patches.Patch(facecolor=colors[1], hatch=hatches[1], label='Erwin', alpha=0.6, edgecolor='black')
acf_patch = patches.Patch(facecolor=colors[2], label='ACF', hatch=hatches[2], alpha=0.6, edgecolor='black')
intersection_patch = patches.Patch(facecolor='white', label='Intersection', alpha=0.6, edgecolor='black')
plt.legend(handles=[unittest_patch, erwin_patch, acf_patch, intersection_patch], loc=(0.8, 0), fontsize=14)
total_lines = len(lines_unittest.union(lines_gen50_0).union(lines_acf))
plt.text(0.5, -0.1, f"Total Unique Lines Covered: {total_lines}", 
         ha='center', va='center', transform=plt.gca().transAxes, fontsize=14)
plt.tight_layout()
plt.savefig('./diagrams/linecov_difference_erwin_unittest_acf.pdf', format='pdf', dpi=300, bbox_inches='tight')
plt.savefig('./diagrams/linecov_difference_erwin_unittest_acf.svg', format='svg', dpi=300, bbox_inches='tight')
