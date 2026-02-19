# Prevent noisy NoMethodError in SolidQueue heartbeat timer when process
# record has already been cleared/pruned.
module SolidQueueHeartbeatGuard
  private

  def heartbeat
    current_process = process
    return unless current_process

    current_process.heartbeat
  rescue ActiveRecord::RecordNotFound
    self.process = nil
    wake_up if respond_to?(:wake_up, true)
  end
end

Rails.application.config.to_prepare do
  require "solid_queue/processes/registrable"

  registrable = SolidQueue::Processes::Registrable
  unless registrable.ancestors.include?(SolidQueueHeartbeatGuard)
    registrable.prepend(SolidQueueHeartbeatGuard)
  end
end
