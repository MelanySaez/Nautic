"""Celery queues the worker declares must be accepted by RabbitMQ 4.x.

RabbitMQ 4 rejects transient non-exclusive queues (deprecated feature
``transient_nonexcl_queues``), so every queue is either durable or exclusive.
"""
from django.test import SimpleTestCase

from config.celery import app


class ColasAceptadasPorRabbitMQ4Tests(SimpleTestCase):
    def test_la_cola_de_control_remoto_es_exclusiva(self):
        cola = app.control.mailbox.get_queue('worker@host')

        self.assertTrue(cola.exclusive)
        self.assertFalse(cola.durable)

    def test_la_cola_de_respuestas_de_control_es_exclusiva(self):
        self.assertTrue(app.control.mailbox.get_reply_queue().exclusive)

    def test_la_cola_de_eventos_es_exclusiva(self):
        with app.connection_for_read() as conexion:
            receptor = app.events.Receiver(conexion, handlers={})

        self.assertTrue(receptor.queue.exclusive)

    def test_las_colas_de_tareas_siguen_siendo_durables(self):
        self.assertTrue(all(cola.durable for cola in app.conf.task_queues))
