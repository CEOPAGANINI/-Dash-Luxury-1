// --- Custom Vanilla JS "WebGL-Style" Structural Canvas Background ---
        const canvas = document.getElementById('structural-grid');
        const ctx = canvas.getContext('2d');
        
        let width, height, particles;
        const particleCount = window.innerWidth < 768 ? 40 : 100;
        const connectionDistance = 150;
        
        let mouse = { x: null, y: null, radius: 200 };

        window.addEventListener('mousemove', (e) => {
            mouse.x = e.x;
            mouse.y = e.y;
        });

        window.addEventListener('mouseout', () => {
            mouse.x = undefined;
            mouse.y = undefined;
        });

        function initCanvas() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle());
            }
        }

        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;
                this.size = Math.random() * 2 + 1;
                this.baseX = this.x;
                this.baseY = this.y;
            }
            update() {
                // Movement
                this.x += this.vx;
                this.y += this.vy;

                // Bounce
                if (this.x < 0 || this.x > width) this.vx *= -1;
                if (this.y < 0 || this.y > height) this.vy *= -1;

                // Mouse interaction (Repel)
                if (mouse.x != null) {
                    let dx = mouse.x - this.x;
                    let dy = mouse.y - this.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < mouse.radius) {
                        const forceDirectionX = dx / distance;
                        const forceDirectionY = dy / distance;
                        const force = (mouse.radius - distance) / mouse.radius;
                        this.x -= forceDirectionX * force * 5;
                        this.y -= forceDirectionY * force * 5;
                    } else {
                        // Return to base slowly
                        this.x -= (this.x - this.baseX) * 0.01;
                        this.y -= (this.y - this.baseY) * 0.01;
                    }
                }
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = '#FF3300';
                ctx.fill();
            }
        }

        function animateCanvas() {
            ctx.clearRect(0, 0, width, height);
            
            // Draw particles
            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();
                
                // Draw connections
                for (let j = i; j < particles.length; j++) {
                    let dx = particles[i].x - particles[j].x;
                    let dy = particles[i].y - particles[j].y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < connectionDistance) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(255, 242, 238, ${1 - distance/connectionDistance})`;
                        ctx.lineWidth = 0.5;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
            requestAnimationFrame(animateCanvas);
        }

        window.addEventListener('resize', initCanvas);
        initCanvas();
        animateCanvas();
        // --- End Canvas ---

        // Scroll Revel Animations
        document.addEventListener("DOMContentLoaded", () => {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.remove('opacity-0', 'translate-y-8', 'translate-y-4', 'translate-x-[-2rem]', 'translate-x-[2rem]', 'scale-95');
                        entry.target.classList.add('opacity-100', 'translate-y-0', 'translate-x-0', 'scale-100');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

            document.querySelectorAll('.reveal-element').forEach((el) => observer.observe(el));

            // Custom Hover Image logic for Trophies section
            const rows = document.querySelectorAll('.project-row');
            const hoverContainer = document.getElementById('hover-image-container');
            const hoverImage = document.getElementById('hover-image');

            rows.forEach(row => {
                row.addEventListener('mouseenter', (e) => {
                    const imgSrc = row.getAttribute('data-img');
                    if(imgSrc && window.innerWidth >= 1024) {
                        hoverImage.src = imgSrc;
                        hoverContainer.style.opacity = '1';
                        hoverContainer.style.transform = 'translate(-50%, -50%) scale(1)';
                    }
                });
                row.addEventListener('mouseleave', () => {
                    hoverContainer.style.opacity = '0';
                    hoverContainer.style.transform = 'translate(-50%, -50%) scale(0.95)';
                });
            });
        });