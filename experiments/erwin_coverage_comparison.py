#!/usr/bin/env python3
"""
Compare coverage maps to show lines and edges covered solely by Erwin
compared against unit tests, ACF, and Fuzzol.
"""

from pathlib import Path
from typing import Dict, Set


def load_coverage_map(file_path: str) -> Set[str]:
    """Load coverage data from a file into a set."""
    coverage_set = set()
    try:
        with open(file_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line:
                    coverage_set.add(line)
    except FileNotFoundError:
        print(f"Warning: File not found: {file_path}")
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
    return coverage_set


def compare_coverage(erwin_coverage: Set[str], other_coverages: Dict[str, Set[str]]) -> Dict[str, Set[str]]:
    """Compare Erwin coverage against other tools and find unique coverage."""
    results = {}

    # Combine all other coverages
    all_other_coverage = set()
    for coverage_set in other_coverages.values():
        all_other_coverage.update(coverage_set)

    # Find coverage unique to Erwin compared to all others combined
    results['erwin_unique'] = erwin_coverage - all_other_coverage

    # Find coverage unique to Erwin compared to each individual tool
    for tool_name, coverage_set in other_coverages.items():
        results[f'erwin_vs_{tool_name}'] = erwin_coverage - coverage_set

    return results


def print_comparison_results(results: Dict[str, Set[str]], coverage_type: str):
    """Print comparison results in a readable format."""
    print(f"\n{'='*60}")
    print(f"{coverage_type.upper()} COVERAGE COMPARISON RESULTS")
    print(f"{'='*60}")

    for key, coverage_set in results.items():
        if 'unique' in key:
            if key == 'erwin_unique':
                print(f"\nCoverage UNIQUE to Erwin (not covered by any other tool): {len(coverage_set)}")
            else:
                tool_name = key.replace('erwin_vs_', '').replace('_', ' ').title()
                print(f"\nCoverage unique to Erwin vs {tool_name}: {len(coverage_set)}")
        else:
            tool_name = key.replace('erwin_vs_', '').replace('_', ' ').title()
            print(f"\nErwin vs {tool_name}: {len(coverage_set)} unique to Erwin")

        if coverage_set:
            print("Sample unique coverage:")
            for i, item in enumerate(sorted(coverage_set)[:10]):
                print(f"  {i+1}. {item}")
            if len(coverage_set) > 10:
                print(f"  ... and {len(coverage_set) - 10} more")
        else:
            print("  No unique coverage found")


def save_results_to_file(results: Dict[str, Set[str]], coverage_type: str, output_file: str):
    """Save complete comparison results to a file."""
    with open(output_file, 'a') as f:
        f.write(f"\n{'='*60}\n")
        f.write(f"{coverage_type.upper()} COVERAGE COMPARISON RESULTS\n")
        f.write(f"{'='*60}\n")

        for key, coverage_set in results.items():
            if 'unique' in key:
                if key == 'erwin_unique':
                    f.write(f"\nCoverage UNIQUE to Erwin (not covered by any other tool): {len(coverage_set)}\n")
                else:
                    tool_name = key.replace('erwin_vs_', '').replace('_', ' ').title()
                    f.write(f"\nCoverage unique to Erwin vs {tool_name}: {len(coverage_set)}\n")
            else:
                tool_name = key.replace('erwin_vs_', '').replace('_', ' ').title()
                f.write(f"\nErwin vs {tool_name}: {len(coverage_set)} unique to Erwin\n")

            if coverage_set:
                f.write(f"Complete list of {len(coverage_set)} unique items:\n")
                for i, item in enumerate(sorted(coverage_set), 1):
                    f.write(f"  {i}. {item}\n")
            else:
                f.write("  No unique coverage found\n")


def save_summary_to_file(line_coverage: Dict[str, Set[str]], edge_coverage: Dict[str, Set[str]],
                         line_results: Dict[str, Set[str]], edge_results: Dict[str, Set[str]],
                         output_file: str):
    """Save summary statistics to a file."""
    with open(output_file, 'a') as f:
        f.write(f"\n{'='*60}\n")
        f.write("SUMMARY STATISTICS\n")
        f.write(f"{'='*60}\n")

        f.write(f"\nLine Coverage:\n")
        f.write(f"  Erwin total: {len(line_coverage['erwin'])}\n")
        f.write(f"  Unique to Erwin (vs all others): {len(line_results['erwin_unique'])}\n")
        f.write(f"  Percentage unique: {len(line_results['erwin_unique']) / len(line_coverage['erwin']) * 100:.2f}%\n")

        f.write(f"\nEdge Coverage:\n")
        f.write(f"  Erwin total: {len(edge_coverage['erwin'])}\n")
        f.write(f"  Unique to Erwin (vs all others): {len(edge_results['erwin_unique'])}\n")
        f.write(f"  Percentage unique: {len(edge_results['erwin_unique']) / len(edge_coverage['erwin']) * 100:.2f}%\n")

        f.write(f"\nDetailed breakdown (vs each tool):\n")
        f.write(f"\nLine Coverage unique to Erwin:\n")
        for tool in ['acf', 'fuzzol', 'unittest', 'trivial']:
            unique_count = len(line_results[f'erwin_vs_{tool}'])
            f.write(f"  vs {tool.upper()}: {unique_count} ({unique_count / len(line_coverage['erwin']) * 100:.2f}%)\n")

        f.write(f"\nEdge Coverage unique to Erwin:\n")
        for tool in ['acf', 'fuzzol', 'unittest', 'trivial']:
            unique_count = len(edge_results[f'erwin_vs_{tool}'])
            f.write(f"  vs {tool.upper()}: {unique_count} ({unique_count / len(edge_coverage['erwin']) * 100:.2f}%)\n")


def save_unique_items_to_files(line_results: Dict[str, Set[str]], edge_results: Dict[str, Set[str]], output_dir: str):
    """Save unique coverage items to separate files for further analysis."""
    # Save line coverage unique items
    for key, coverage_set in line_results.items():
        if 'unique' in key and coverage_set:
            filename = f"{output_dir}/line_{key}.txt"
            with open(filename, 'w') as f:
                for item in sorted(coverage_set):
                    f.write(f"{item}\n")

    # Save edge coverage unique items
    for key, coverage_set in edge_results.items():
        if 'unique' in key and coverage_set:
            filename = f"{output_dir}/edge_{key}.txt"
            with open(filename, 'w') as f:
                for item in sorted(coverage_set):
                    f.write(f"{item}\n")


def main():
    """Main function to run the coverage comparison."""
    # Define file paths
    base_path = Path("./coverages")
    output_dir = Path(".")

    # Output files
    main_output_file = output_dir / "erwin_coverage_comparison_results.txt"

    # Clear or create output file
    with open(main_output_file, 'w') as f:
        f.write("Erwin Coverage Comparison Results\n")
        f.write("Generated on: " + str(Path(__file__).stat().st_mtime) + "\n")
        f.write("Comparing Erwin against ACF, Fuzzol, Unit Tests, and Trivial\n")
        f.write("="*60 + "\n")

    # Line coverage files
    line_files = {
        'erwin': base_path / "linecovmap_gen50_0.txt",
        'acf': base_path / "linecovmap_acf.txt",
        'fuzzol': base_path / "linecovmap_fuzzol.txt",
        'unittest': base_path / "linecovmap_unittest.txt",
        'trivial': base_path / "linecovmap_trivial_0.txt"
    }

    # Edge coverage files
    edge_files = {
        'erwin': base_path / "edgecovmap_gen50.txt",
        'acf': base_path / "edgecovmap_acf.txt",
        'fuzzol': base_path / "edgecovmap_fuzzol.txt",
        'unittest': base_path / "edgecovmap_unittest.txt",
        'trivial': base_path / "edgecovmap_trivial.txt"
    }

    print("Erwin Coverage Comparison Tool")
    print("Comparing Erwin against ACF, Fuzzol, Unit Tests, and Trivial")
    print("="*60)

    # Load line coverage data
    print("\nLoading line coverage data...")
    with open(main_output_file, 'a') as f:
        f.write("\nLoading line coverage data...\n")

    line_coverage = {}
    for tool, file_path in line_files.items():
        line_coverage[tool] = load_coverage_map(str(file_path))
        print(f"  {tool}: {len(line_coverage[tool])} lines")
        with open(main_output_file, 'a') as f:
            f.write(f"  {tool}: {len(line_coverage[tool])} lines\n")

    # Load edge coverage data
    print("\nLoading edge coverage data...")
    with open(main_output_file, 'a') as f:
        f.write("\nLoading edge coverage data...\n")

    edge_coverage = {}
    for tool, file_path in edge_files.items():
        edge_coverage[tool] = load_coverage_map(str(file_path))
        print(f"  {tool}: {len(edge_coverage[tool])} edges")
        with open(main_output_file, 'a') as f:
            f.write(f"  {tool}: {len(edge_coverage[tool])} edges\n")

    # Compare line coverage
    print("\nAnalyzing line coverage...")
    with open(main_output_file, 'a') as f:
        f.write("\nAnalyzing line coverage...\n")

    other_line_coverage = {k: v for k, v in line_coverage.items() if k != 'erwin'}
    line_results = compare_coverage(line_coverage['erwin'], other_line_coverage)
    print_comparison_results(line_results, "line")
    save_results_to_file(line_results, "line", str(main_output_file))

    # Compare edge coverage
    print("\nAnalyzing edge coverage...")
    with open(main_output_file, 'a') as f:
        f.write("\nAnalyzing edge coverage...\n")

    other_edge_coverage = {k: v for k, v in edge_coverage.items() if k != 'erwin'}
    edge_results = compare_coverage(edge_coverage['erwin'], other_edge_coverage)
    print_comparison_results(edge_results, "edge")
    save_results_to_file(edge_results, "edge", str(main_output_file))

    # Save summary statistics
    save_summary_to_file(line_coverage, edge_coverage, line_results, edge_results, str(main_output_file))

    # Save unique items to separate files
    print("\nSaving unique coverage items to separate files...")
    save_unique_items_to_files(line_results, edge_results, str(output_dir))

    # Print summary statistics
    print(f"\n{'='*60}")
    print("SUMMARY STATISTICS")
    print(f"{'='*60}")

    print(f"\nLine Coverage:")
    print(f"  Erwin total: {len(line_coverage['erwin'])}")
    print(f"  Unique to Erwin (vs all others): {len(line_results['erwin_unique'])}")
    print(f"  Percentage unique: {len(line_results['erwin_unique']) / len(line_coverage['erwin']) * 100:.2f}%")

    print(f"\nEdge Coverage:")
    print(f"  Erwin total: {len(edge_coverage['erwin'])}")
    print(f"  Unique to Erwin (vs all others): {len(edge_results['erwin_unique'])}")
    print(f"  Percentage unique: {len(edge_results['erwin_unique']) / len(edge_coverage['erwin']) * 100:.2f}%")

    # Detailed breakdown by tool
    print(f"\nDetailed breakdown (vs each tool):")
    print(f"\nLine Coverage unique to Erwin:")
    for tool in ['acf', 'fuzzol', 'unittest', 'trivial']:
        unique_count = len(line_results[f'erwin_vs_{tool}'])
        print(f"  vs {tool.upper()}: {unique_count} ({unique_count / len(line_coverage['erwin']) * 100:.2f}%)")

    print(f"\nEdge Coverage unique to Erwin:")
    for tool in ['acf', 'fuzzol', 'unittest', 'trivial']:
        unique_count = len(edge_results[f'erwin_vs_{tool}'])
        print(f"  vs {tool.upper()}: {unique_count} ({unique_count / len(edge_coverage['erwin']) * 100:.2f}%)")

    print(f"\n\nComplete results saved to: {main_output_file}")
    print("Unique coverage items saved to separate files in the experiments directory")


if __name__ == "__main__":
    main()