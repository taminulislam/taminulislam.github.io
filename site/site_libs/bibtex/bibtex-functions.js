document.addEventListener('DOMContentLoaded', function() {
    // BibTeX toggle functionality
    document.querySelectorAll('.bibtex-toggle').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const content = link.nextElementSibling;
            content.classList.toggle('active');
            
            if (content.classList.contains('active')) {
                content.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    });

    // Copy button functionality
    document.querySelectorAll('.copy-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const bibtex = button.parentElement.nextElementSibling.textContent;
            navigator.clipboard.writeText(bibtex).then(() => {
                button.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(() => {
                    button.innerHTML = '<i class="fa-regular fa-copy"></i>';
                }, 2000);
            });
        });
    });
});