if defined?(SolidQueue)
  queue_config = ActiveRecord::Base.configurations.configs_for(
    env_name: Rails.env,
    name: "queue"
  )

  has_queue_config = Array(queue_config).any?

  SolidQueue.connects_to = { database: { writing: :queue } } if has_queue_config
end
