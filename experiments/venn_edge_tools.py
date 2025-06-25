import matplotlib.pyplot as plt
from venn import venn

# Read the data
with open('./coverages/edgecovmap_fuzzol.txt', 'r') as f:
    edges_fuzzol = set(f.read().splitlines())
with open('./coverages/edgecovmap_erwin.txt', 'r') as f:
    edges_erwin = set(f.read().splitlines())
with open('./coverages/edgecovmap_acf.txt', 'r') as f:
    edges_acf = set(f.read().splitlines())

fig, ax = plt.subplots(figsize=(10, 7))

bugs = {
    'Erwin': edges_erwin,
    'Fuzzol': edges_fuzzol,
    'ACF': edges_acf,
    # 'Erwin & ACF': bugs_erwin_acf
}

# Create the Venn diagram with hatches
v = venn(bugs, ax=ax, fontsize=25)
fig.show()
# Save using the Figure object (not plt)
fig.tight_layout()
fig.savefig(
    './diagrams/edgecov_difference_erwin_acf_fuzzol_venn.pdf',
    format='pdf',
    dpi=300,
    bbox_inches='tight'
)

# Modify legend properties and move it below the chart
# plt.legend(
#     loc='lower center',        # Positions legend below the diagram
#     bbox_to_anchor=(0.45, -0.1),  # Fine-tune exact position
#     fontsize=18,               # Increased font size
#     frameon=False,             # Cleaner look without border
#     ncol=2                     # Arrange labels in 2 columns
# )
# Close the figure to free memory
plt.close(fig)
