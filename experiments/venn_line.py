import matplotlib.pyplot as plt
from venn import venn

# Read the data
with open('./coverages/linecovmap_unittest.txt', 'r') as f:
    lines_unittest = set(f.read().splitlines())
with open('./coverages/linecovmap_gen50_0.txt', 'r') as f:
    lines_gen50_0 = set(f.read().splitlines())
with open('./coverages/linecovmap_acf_unittest.txt', 'r') as f:
    lines_acf = set(f.read().splitlines())

fig, ax = plt.subplots(figsize=(10, 7))

bugs = {
    'unittest': lines_unittest,
    # 'ACF': lines_acf,
    'Erwin': lines_gen50_0,
    # 'Erwin & ACF': bugs_erwin_acf
}

# Create the Venn diagram with hatches
v = venn(bugs, ax=ax, fontsize=25)
fig.show()
# Save using the Figure object (not plt)
fig.tight_layout()
fig.savefig(
    './diagrams/linecov_difference_erwin_unittest_venn.pdf',
    format='pdf',
    dpi=300,
    bbox_inches='tight'
)


# Close the figure to free memory
plt.close(fig)
