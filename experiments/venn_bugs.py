import matplotlib.pyplot as plt
from venn import venn

# Read the data (unchanged)
with open('./test_programs/erwin_bugs.csv') as f:
    bugs_erwin = set([l.split(',')[0].strip() for l in f.read().splitlines()[1:]])
with open('./test_programs/fuzzol_bugs.csv') as f:
    bugs_fuzzol = set([l.split(',')[0].strip() for l in f.read().splitlines()])
with open('./test_programs/acf_bugs.csv') as f:
    bugs_acf = set([l.split(',')[0].strip() for l in f.read().splitlines()])
# with open('./test_programs/erwin_acf_bugs.txt') as f:
#     bugs_erwin_acf = set([l.split('->')[0].strip() for l in f.read().splitlines()]) | bugs_erwin

# Set up the figure
fig, ax = plt.subplots(figsize=(10, 7))

# Create dictionary
bugs = {
    'Erwin': bugs_erwin,
    'Fuzzol': bugs_fuzzol,
    'ACF': bugs_acf,
    # 'Erwin & ACF': bugs_erwin_acf
}

# Create the Venn diagram with hatches
v = venn(bugs, ax=ax, fontsize=25)
fig.show()
# Save using the Figure object (not plt)
fig.tight_layout()
fig.savefig(
    './diagrams/benchmark_bugs.pdf',
    format='pdf',
    dpi=300,
    bbox_inches='tight'
)
fig.savefig(
    './diagrams/benchmark_bugs.svg',
    format='svg',
    dpi=300,
    bbox_inches='tight'
)

# Close the figure to free memory
plt.close(fig)