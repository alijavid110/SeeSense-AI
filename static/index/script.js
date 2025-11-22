// Waiting for hero section to load first
document.addEventListener('DOMContentLoaded', function() {
            const heroSection = document.getElementById('heroSection');
            // Adding double click event listener
            if (heroSection) {
                heroSection.addEventListener('dblclick', function() {
                    window.location.href = 'demo.html';
                });
            }
        });