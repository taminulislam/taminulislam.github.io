document.addEventListener('DOMContentLoaded', function() {
    // Get all bibtex toggle buttons
    const toggleButtons = document.querySelectorAll('.bibtex-toggle');
    
    toggleButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault(); // Prevent default link behavior
            
            // Find the closest bibtex-content div
            const bibtexContent = this.closest('.project-link').querySelector('.bibtex-content');
            
            // Toggle the display
            if (bibtexContent.style.display === 'none') {
                bibtexContent.style.display = 'block';
            } else {
                bibtexContent.style.display = 'none';
            }
        });
    });

    // Close bibtex when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.project-link.details')) {
            document.querySelectorAll('.bibtex-content').forEach(content => {
                content.style.display = 'none';
            });
        }
    });
});