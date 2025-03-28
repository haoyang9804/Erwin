import matplotlib.pyplot as plt
from matplotlib_venn import venn2, venn3
import matplotlib.patches as patches
from venn import venn

# Read the data
with open('./coverages/edgecovmap_unittest.txt', 'r') as f:
    edges_unittest = set(f.read().splitlines())
with open('./coverages/edgecovmap_gen50.txt', 'r') as f:
    edges_gen50_0 = set(f.read().splitlines())
with open('./coverages/edgecovmap_acf.txt', 'r') as f:
    edges_acf = set(f.read().splitlines())

# Set up the figure
plt.figure(figsize=(10, 7))
# plt.title("Code Coverage Comparison", fontsize=16, fontweight='bold')

# Create the Venn diagram
v = venn2([edges_unittest, edges_gen50_0], ('Unittest', 'Erwin'))

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
total_edges = len(edges_unittest.union(edges_gen50_0))
plt.text(0.5, -0.1, f"Total Unique Edges Covered: {total_edges}", 
         ha='center', va='center', transform=plt.gca().transAxes, fontsize=14)

# Adjust layout
plt.tight_layout()

# Save figures
plt.savefig('./diagrams/edgecov_difference_erwin_unittest.pdf', format='pdf', dpi=300, bbox_inches='tight')

plt = plt.figure(figsize=(10, 7))

v = venn3([edges_unittest, edges_gen50_0, edges_acf], ('Unittest', 'Erwin', 'ACF'))
for i, id in enumerate(['101', '010', '001', '110', '100', '011', '111']):
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
acf_patch = patches.Patch(facecolor=colors[4], hatch=hatches[4], label='ACF', alpha=0.6, edgecolor='black')
intersection_patch = patches.Patch(facecolor='white', label='Intersection', alpha=0.6, edgecolor='black')
plt.legend(handles=[unittest_patch, erwin_patch, acf_patch, intersection_patch], loc=(0.8, 0), fontsize=14)
total_edges = len(edges_unittest.union(edges_gen50_0).union(edges_acf))
plt.text(0.5, -0.1, f"Total Unique Edges Covered: {total_edges}", 
         ha='center', va='center', transform=plt.gca().transAxes, fontsize=14)
plt.tight_layout()
plt.savefig('./diagrams/edgecov_difference_erwin_unittest_acf.pdf', format='pdf', dpi=300, bbox_inches='tight')

fig, ax = plt.subplots(figsize=(10, 7))

bugs = {
    'unittest': edges_unittest,
    'ACF': edges_acf,
    'Erwin': edges_gen50_0,
    # 'Erwin & ACF': bugs_erwin_acf
}

# Create the Venn diagram with hatches
v = venn(bugs, ax=ax, fontsize=15)
fig.show()
# Save using the Figure object (not plt)
fig.tight_layout()
fig.savefig(
    './diagrams/edgecov_difference_erwin_unittest_acf_venn.pdf',
    format='pdf',
    dpi=300,
    bbox_inches='tight'
)

# Close the figure to free memory
plt.close(fig)
