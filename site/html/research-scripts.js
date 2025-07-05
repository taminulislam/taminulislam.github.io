/* Research Page Scripts */
document.addEventListener('DOMContentLoaded', function() {
    const yearButtons = document.querySelectorAll('.year-btn');
    const projects = document.querySelectorAll('.project');
    
    // Add click event listeners to all year filter buttons
    yearButtons.forEach(button => {
        button.addEventListener('click', function() {
            const selectedYear = this.getAttribute('data-year');
            
            // Update button states
            yearButtons.forEach(btn => {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-outline-primary');
            });
            
            // Set clicked button as active
            this.classList.remove('btn-outline-primary');
            this.classList.add('btn-primary');
            
            // Filter projects
            filterProjects(selectedYear);
        });
    });
    
    function filterProjects(year) {
        projects.forEach(project => {
            const projectYear = project.getAttribute('data-year');
            
            if (year === 'all' || projectYear === year) {
                project.style.display = 'block';
                // Add fade-in animation
                project.style.opacity = '0';
                setTimeout(() => {
                    project.style.opacity = '1';
                }, 50);
            } else {
                project.style.display = 'none';
            }
        });
        
        // Update the visible count or show no results message if needed
        const visibleProjects = document.querySelectorAll('.project[style*="display: block"], .project:not([style*="display: none"])');
        
        // Optional: Add a subtle animation effect
        projects.forEach((project, index) => {
            if (project.style.display !== 'none') {
                project.style.animationDelay = (index * 0.1) + 's';
            }
        });
    }
    
    // Initialize with 'All' selected
    filterProjects('all');
}); 