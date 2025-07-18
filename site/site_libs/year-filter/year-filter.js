document.addEventListener('DOMContentLoaded', function() {
    // Get all year filter buttons and projects
    const yearButtons = document.querySelectorAll('.year-btn-simple');
    const projects = document.querySelectorAll('.project');

    // Add click event listener to each button
    yearButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            yearButtons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            this.classList.add('active');
            
            const selectedYear = this.getAttribute('data-year');
            
            // Show/hide projects based on year
            projects.forEach(project => {
                if (selectedYear === 'all') {
                    project.style.display = 'block';
                } else {
                    const projectYear = project.getAttribute('data-year');
                    project.style.display = projectYear === selectedYear ? 'block' : 'none';
                }
            });
        });
    });
});